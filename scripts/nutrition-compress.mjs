import { readFile, readdir, writeFile, rename, unlink } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { nutritionRoot, sha256, atomicJSON } from "./nutrition-usda.mjs";

export async function compressNutritionCache({
  root = nutritionRoot,
  apply = false,
} = {}) {
  const entries = [];
  let changed = 0;
  for (const kind of ["queries", "usda"]) {
    const directory = path.join(root, "sources/nutrition", kind);
    const names = (await readdir(directory))
      .filter((name) => /\.json(?:\.gz)?$/.test(name))
      .sort();
    const logicalNames = [
      ...new Set(names.map((name) => name.replace(/\.gz$/, ""))),
    ].sort();
    for (const name of logicalNames) {
      const plainPath = path.join(directory, name);
      const hasPlain = names.includes(name);
      const hasGzip = names.includes(`${name}.gz`);
      const existing = hasGzip ? await readFile(`${plainPath}.gz`) : null;
      const raw = hasPlain ? await readFile(plainPath) : gunzipSync(existing);
      JSON.parse(raw.toString("utf8"));
      if (existing && !gunzipSync(existing).equals(raw))
        throw new Error(
          `明文与压缩缓存不一致：${kind}/${name}；未删除该原文件`,
        );
      const compressed = existing ?? gzipSync(raw, { level: 9 });
      if (!gunzipSync(compressed).equals(raw))
        throw new Error("压缩回读校验失败");
      entries.push({
        path: `sources/nutrition/${kind}/${name}.gz`,
        original_bytes: raw.length,
        original_sha256: sha256(raw),
        bytes: compressed.length,
        sha256: sha256(compressed),
      });
      if (hasPlain) {
        changed++;
        if (apply) {
          if (!hasGzip) {
            await writeFile(`${plainPath}.gz.tmp`, compressed);
            await rename(`${plainPath}.gz.tmp`, `${plainPath}.gz`);
          }
          // 只有完整写入并回读逐字节相同后，才移除可由gzip恢复的明文副本。
          if (!gunzipSync(await readFile(`${plainPath}.gz`)).equals(raw))
            throw new Error("落盘校验失败，原文件保留");
          await unlink(plainPath);
        }
      }
    }
  }
  if (apply)
    await atomicJSON(path.join(root, "sources/nutrition/cache-archive.json"), {
      schema_version: 1,
      format: "gzip",
      note: "无损原始响应归档；逻辑.json路径可自动读取.json.gz，SHA分别校验原始字节与压缩文件。",
      entries,
    });
  return {
    mode: apply ? "compressed" : "preview",
    files: entries.length,
    changed,
    original_bytes: entries.reduce((sum, item) => sum + item.original_bytes, 0),
    bytes: entries.reduce((sum, item) => sum + item.bytes, 0),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.slice(2).some((flag) => flag !== "--apply"))
    throw new Error("仅支持 --apply；默认预览");
  console.log(
    JSON.stringify(
      await compressNutritionCache({ apply: process.argv.includes("--apply") }),
    ),
  );
}
