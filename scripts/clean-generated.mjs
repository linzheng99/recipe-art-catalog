import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const directories = ["public/assets/recipe-details", "public/assets/nutrition"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function cleanGenerated({
  root = defaultRoot,
  apply = false,
} = {}) {
  // 已跟踪的旧摘要仍可能被线上旧页面使用，始终保留；只归档未发布的本地中间版本。
  const tracked = new Set(
    execFileSync("git", ["ls-files", "-z", "--", ...directories], {
      cwd: root,
      encoding: "utf8",
    }).split("\0"),
  );
  const referenced = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (
          key === "path" &&
          typeof item === "string" &&
          /^assets\/(recipe-details|nutrition)\/[a-z0-9-]+\.[a-f0-9]{16}\.json$/.test(
            item,
          )
        )
          referenced.add(`public/${item}`);
        collect(item);
      }
    }
  };
  // 三个入口必须都能读到；入口缺失或损坏时不碰任何文件。
  const manifests = [];
  for (const file of [
    "public/manifest.json",
    "public/manifest-lite.json",
    "public/nutrition/index.json",
  ])
    manifests.push(JSON.parse(await readFile(path.join(root, file), "utf8")));
  const [full, lite, nutrition] = manifests;
  if (
    manifests.some((item) => item.schema_version !== 1) ||
    !full.version ||
    full.version !== lite.version ||
    !Array.isArray(full.artworks) ||
    !full.artworks.length ||
    !Array.isArray(lite.artworks) ||
    lite.artworks.length !== full.artworks.length ||
    !Array.isArray(nutrition.profiles) ||
    (full.nutrition_catalog &&
      full.nutrition_catalog.version !== nutrition.version)
  )
    throw new Error(
      "当前清单缺失、版本不同或结构异常，请先完成构建；未归档任何文件",
    );
  manifests.forEach(collect);
  for (const file of referenced) await access(path.join(root, file));
  const entries = [];
  let skipped = 0;
  for (const directory of directories) {
    for (const name of await readdir(path.join(root, directory))) {
      const match = name.match(/^[a-z0-9-]+\.([a-f0-9]{16})\.json$/);
      if (!match) continue;
      const relative = path.posix.join(directory, name),
        file = path.join(root, relative);
      if (tracked.has(relative) || referenced.has(relative)) continue;
      if (!(await lstat(file)).isFile()) {
        skipped++;
        continue;
      }
      const bytes = await readFile(file),
        sha256 = digest(bytes);
      if (!sha256.startsWith(match[1])) {
        skipped++;
        continue;
      }
      entries.push({ path: relative, bytes: bytes.length, sha256 });
    }
  }
  const summary = {
    mode: apply ? "archived" : "preview",
    files: entries.length,
    bytes: entries.reduce((n, x) => n + x.bytes, 0),
    skipped,
  };
  if (!apply || !entries.length) return summary;
  const archive = path.posix.join(
    ".cache/generated-history",
    `${new Date().toISOString().replace(/[.:]/g, "-")}-${randomUUID().slice(0, 8)}`,
  );
  const inventory = path.join(root, archive, "inventory.json");
  await mkdir(path.dirname(inventory), { recursive: true });
  const record = {
    schema_version: 1,
    status: "archiving",
    reason: "untracked_unreferenced_generated_history",
    entries,
  };
  await writeFile(inventory, JSON.stringify(record, null, 2) + "\n");
  const moved = [];
  try {
    for (const entry of entries) {
      const destination = path.join(root, archive, entry.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await rename(path.join(root, entry.path), destination);
      moved.push(entry);
    }
  } catch (error) {
    for (const entry of moved.reverse())
      await rename(
        path.join(root, archive, entry.path),
        path.join(root, entry.path),
      );
    record.status = "rolled_back";
    await writeFile(inventory, JSON.stringify(record, null, 2) + "\n");
    throw error;
  }
  record.status = "complete";
  await writeFile(inventory, JSON.stringify(record, null, 2) + "\n");
  return { ...summary, archive };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.slice(2).some((arg) => arg !== "--apply"))
    throw new Error("用法：npm run clean:generated [-- --apply]；默认只预览");
  console.log(
    JSON.stringify(
      await cleanGenerated({ apply: process.argv.includes("--apply") }),
    ),
  );
}
