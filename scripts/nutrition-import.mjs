import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  readJSON,
  atomicJSON,
  sha256,
  nutritionRoot,
} from "./nutrition-usda.mjs";

// 批量文件由官方页面下载并解压；只导入明确选择的FDC ID，不自动批准营养映射。
export async function importBulk({
  filename,
  ids,
  datasetURL,
  release,
  retrievedAt = new Date().toISOString(),
  root = nutritionRoot,
}) {
  const url = new URL(datasetURL);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "fdc.nal.usda.gov" ||
    !release?.trim() ||
    !Number.isFinite(Date.parse(retrievedAt))
  )
    throw new Error("批量来源必须有USDA官方URL、版本和获取日期");
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => Number.isSafeInteger(id) && id > 0)
  )
    throw new Error("非法或重复FDC ID");
  const data = await readFile(filename);
  const full = JSON.parse(data.toString("utf8"));
  const foods = Object.values(full).filter(Array.isArray).flat();
  const selected = ids.map((id) => {
    const matches = foods.filter((food) => food?.fdcId === id);
    if (matches.length !== 1) throw new Error(`批量文件中FDC ${id} 缺失或重复`);
    return matches[0];
  });
  const results = [];
  for (const food of selected) {
    const filename = path.join(
      root,
      "sources/nutrition/usda",
      `${food.fdcId}.json`,
    );
    try {
      await readJSON(filename);
      results.push({ fdc_id: food.fdcId, status: "cached_unchanged" });
      continue;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await atomicJSON(filename, {
      schema_version: 1,
      provider: "USDA FoodData Central",
      transport: "official_bulk_json",
      dataset_url: datasetURL,
      release,
      retrieved_at: retrievedAt,
      dataset_sha256: sha256(data),
      raw_sha256: sha256(JSON.stringify(food)),
      response: food,
    });
    results.push({ fdc_id: food.fdcId, status: "imported_pending_review" });
  }
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2),
    value = (flag) => args[args.indexOf(flag) + 1];
  try {
    console.log(
      JSON.stringify(
        await importBulk({
          filename: value("--file"),
          ids: value("--ids").split(",").map(Number),
          datasetURL: value("--dataset-url"),
          release: value("--release"),
        }),
      ),
    );
  } catch {
    console.error(
      "批量导入失败；检查解压后的JSON、FDC ID与官方来源版本。已有数据未被覆盖。",
    );
    process.exitCode = 1;
  }
}
