import { execFileSync } from "node:child_process";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readJSON, nutritionRoot } from "./nutrition-usda.mjs";

function recipeState(index, row) {
  return {
    status: row.status,
    name: row.name,
    profiles: index.profiles.filter(
      (profile) => profile.recipe_id === row.recipe_id,
    ),
    nutrition: row.nutrition,
  };
}

export function nutritionChanges(
  previous,
  current,
  { baseRef = null, commit = null } = {},
) {
  const before = new Map(
    (previous?.recipes ?? []).map((row) => [
      row.recipe_id,
      recipeState(previous, row),
    ]),
  );
  const after = new Map(
    current.recipes.map((row) => [row.recipe_id, recipeState(current, row)]),
  );
  const changes = [];
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(id),
      next = after.get(id);
    if (isDeepStrictEqual(old, next)) continue;
    const fields = ["status", "name", "profiles", "nutrition"].filter(
      (key) => !isDeepStrictEqual(old?.[key], next?.[key]),
    );
    changes.push({
      recipe_id: id,
      name: next?.name ?? old.name,
      kind: !old ? "added" : !next ? "removed" : "changed",
      changed_fields: fields,
      before: old ?? null,
      after: next ?? null,
    });
  }
  return {
    schema_version: 1,
    base_ref: baseRef,
    commit,
    from_version: previous?.version ?? null,
    to_version: current.version,
    rules_version: current.rules_version,
    counts: Object.fromEntries(
      ["added", "changed", "removed"].map((kind) => [
        kind,
        changes.filter((row) => row.kind === kind).length,
      ]),
    ),
    changes,
  };
}

export async function writeNutritionChanges({
  root = nutritionRoot,
  baseRef = "HEAD^",
  out = ".cache/nutrition/changes.json",
  summary = process.env.GITHUB_STEP_SUMMARY,
} = {}) {
  if (!/^(?:[a-f0-9]{7,40}|HEAD(?:\^|~\d+)?)$/.test(baseRef))
    throw new Error("基准必须为提交SHA或HEAD引用");
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  let previous = null;
  if (!/^0{40}$/.test(baseRef)) {
    git(["rev-parse", "--verify", `${baseRef}^{commit}`]);
    const filename = "public/nutrition/index.json";
    if (git(["ls-tree", "--name-only", baseRef, "--", filename]))
      previous = JSON.parse(git(["show", `${baseRef}:${filename}`]));
  }
  const current = await readJSON(
    path.join(root, "public/nutrition/index.json"),
  );
  const report = nutritionChanges(previous, current, {
    baseRef,
    commit: git(["rev-parse", "HEAD"]),
  });
  const target = path.resolve(root, out);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + "\n");
  if (summary)
    await appendFile(
      summary,
      [
        "## 营养数据变化",
        "",
        `版本：${report.from_version ?? "首次发布"} → ${report.to_version}`,
        "",
        `新增 ${report.counts.added} 篇，调整 ${report.counts.changed} 篇，移除 ${report.counts.removed} 篇。`,
        "",
        "| 菜谱 | 变化 |",
        "| --- | --- |",
        ...report.changes.map(
          (row) => `| ${row.name.replaceAll("|", "／")} | ${row.kind} |`,
        ),
        "",
        "完整前后数值、来源与适用范围见站点 nutrition/changes.json。",
        "",
      ].join("\n"),
    );
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2),
    options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--base-ref", "--out"].includes(args[i]) || !args[i + 1])
      throw new Error("参数：--base-ref <提交> --out <输出路径>");
    options[args[i] === "--base-ref" ? "baseRef" : "out"] = args[i + 1];
  }
  const report = await writeNutritionChanges(options);
  console.log(
    JSON.stringify({ version: report.to_version, counts: report.counts }),
  );
}
