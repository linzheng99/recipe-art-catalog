import path from "node:path";
import { readFile, copyFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readKRDASnapshot } from "./nutrition-krda.mjs";
import {
  atomicJSON,
  readJSON,
  sha256,
  nutritionRoot,
} from "./nutrition-usda.mjs";

export const MEXT_DATASET = {
  provider: "mext",
  name: "MEXT 日本食品標準成分表",
  release: "日本食品標準成分表（八訂）増補2023年 / 正誤表2026-03-27",
  url: "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx",
  dataset_path:
    "sources/nutrition/mext/datasets/composition-2023-20260327.xlsx",
  license: {
    name: "MEXT food composition data reuse with attribution",
    url: "https://www.mext.go.jp/a_menu/syokuhinseibun/",
    attribution:
      "出典：日本食品標準成分表（八訂）増補2023年（文部科学省）。本项目加工计算。",
  },
};
const ensure = (value, message) => {
  if (!value) throw new Error(message);
};
export const mextFoodURL = (id) => {
  ensure(/^\d{5}$/.test(id), "MEXT食品编号无效");
  return `https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=${Number(id.slice(0, 2))}_${id}_7`;
};
const fields = {
  energy_kcal: ["G", "ENERC_KCAL", "kcal"],
  protein_g: ["J", "PROT-", "g"],
  carbohydrate_g: ["U", "CHOCDF-", "g"],
  fat_g: ["M", "FAT-", "g"],
};
export function readCompositionSnapshot(snapshot, expected) {
  if (expected.provider === "krda") return readKRDASnapshot(snapshot, expected);
  ensure(
    snapshot?.schema_version === 1 &&
      snapshot.provider === "mext" &&
      expected.provider === "mext" &&
      /^\d{5}$/.test(expected.food_id),
    "不支持的食物成分来源",
  );
  const food = snapshot.response;
  ensure(
    snapshot.raw_sha256 === sha256(JSON.stringify(food)) &&
      expected.snapshot_sha256 === snapshot.raw_sha256,
    "食物成分原始缓存摘要不一致",
  );
  ensure(
    food.food_id === expected.food_id &&
      food.cells.B === expected.food_id &&
      food.description === expected.description &&
      food.cells.D === expected.description &&
      expected.data_type === "MEXT Standard Tables",
    "食品编号、描述或来源类型变化，需重新审核",
  );
  ensure(
    Number.isFinite(Date.parse(snapshot.retrieved_at)) &&
      snapshot.release === MEXT_DATASET.release &&
      snapshot.dataset_url === MEXT_DATASET.url &&
      /^[a-f0-9]{64}$/.test(snapshot.dataset_sha256),
    "食物成分来源版本或获取日期缺失",
  );
  const per100g = {},
    evidence = {};
  ensure(
    food.header_units?.G === "kcal" &&
      food.basis_header?.replace(/\s/g, "").includes("100g"),
    "MEXT单位或每100g可食部基准变化",
  );
  for (const [key, [column, identifier, unit]] of Object.entries(fields)) {
    ensure(
      food.header_cells[column] === identifier,
      "MEXT营养素列或单位基准改变，需重新核对原表",
    );
    const raw = food.cells[column];
    const text = String(raw ?? "").trim();
    // Tr是痕量，短横线是未给值，不能静默填0；括号数值是来源给出的推定值。
    const estimated = /^\(.*\)$/.test(text);
    const numeric = estimated ? text.slice(1, -1) : text;
    const value = ["", "-", "Tr", "(Tr)"].includes(text)
      ? null
      : /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(numeric)
        ? Number(numeric)
        : NaN;
    ensure(
      value === null ||
        (Number.isFinite(value) &&
          value >= 0 &&
          value <= (unit === "g" ? 100 : 1000)),
      "MEXT营养值格式或范围错误",
    );
    per100g[key] = value;
    evidence[key] = {
      identifier,
      column,
      cell: `${column}${food.row_number}`,
      unit,
      raw_value: raw ?? null,
      amount_per_100g: value,
      estimated_in_source: estimated,
      trace_in_source: /Tr/.test(text),
    };
  }
  ensure(
    ["protein_g", "carbohydrate_g", "fat_g"].reduce(
      (sum, key) => sum + (per100g[key] ?? 0),
      0,
    ) <= 105,
    "MEXT已知宏量营养超过每100g质量上限",
  );
  return {
    per_100g: per100g,
    nutrient_evidence: evidence,
    source: {
      provider: "mext",
      name: MEXT_DATASET.name,
      food_id: food.food_id,
      description: food.description,
      data_type: expected.data_type,
      publication_date: "2026-03-27",
      retrieved_at: snapshot.retrieved_at,
      url: mextFoodURL(food.food_id),
      version: `${snapshot.release} / ${snapshot.raw_sha256.slice(0, 16)}`,
      raw_sha256: snapshot.raw_sha256,
      transport: "official_bulk_xlsx",
      dataset_url: snapshot.dataset_url,
      dataset_sha256: snapshot.dataset_sha256,
      sheet_name: food.sheet_name,
      row_number: food.row_number,
      license: MEXT_DATASET.license,
      nutrient_definition: {
        carbohydrate_g:
          "CHOCDF-: 差减法总碳水，保留来源口径，不替换为可利用碳水",
        energy_kcal: "保留日本成分表能量值，未按4/4/9改写",
      },
    },
  };
}

export async function importMEXT({
  file,
  ids,
  root = nutritionRoot,
  retrievedAt = new Date().toISOString(),
}) {
  ensure(
    Array.isArray(ids) &&
      ids.length &&
      ids.every((id) => /^\d{5}$/.test(id)) &&
      new Set(ids).size === ids.length,
    "需显式指定不重复的MEXT食品编号",
  );
  const bytes = await readFile(file);
  const output = path.join(root, ".cache/nutrition/mext/import.json");
  const extract = spawnSync(
    "python3",
    [
      path.join(nutritionRoot, "scripts/nutrition-mext-extract.py"),
      file,
      "--ids",
      ids.join(","),
      "--output",
      output,
    ],
    { encoding: "utf8" },
  );
  ensure(extract.status === 0, "官方成分表提取失败，未覆盖已完成记录");
  const parsed = await readJSON(output);
  ensure(parsed.dataset_sha256 === sha256(bytes), "官方成分表文件摘要变化");
  const dataset = path.join(root, MEXT_DATASET.dataset_path);
  await mkdir(path.dirname(dataset), { recursive: true });
  try {
    ensure(
      sha256(await readFile(dataset)) === parsed.dataset_sha256,
      "同版本官方成分表已存在不同内容，须显式升级来源",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await copyFile(file, dataset);
  }
  let imported = 0;
  for (const response of parsed.foods) {
    const snapshot = {
      schema_version: 1,
      provider: "mext",
      transport: "official_bulk_xlsx",
      dataset_url: MEXT_DATASET.url,
      dataset_sha256: parsed.dataset_sha256,
      release: MEXT_DATASET.release,
      retrieved_at: retrievedAt,
      raw_sha256: sha256(JSON.stringify(response)),
      response,
    };
    const target = path.join(
      root,
      "sources/nutrition/mext",
      `${response.food_id}.json`,
    );
    try {
      const existing = await readJSON(target);
      ensure(
        existing.raw_sha256 === snapshot.raw_sha256 &&
          existing.dataset_sha256 === snapshot.dataset_sha256,
        "已有食品快照变化，须先审核新版本",
      );
      continue;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    readCompositionSnapshot(snapshot, {
      provider: "mext",
      food_id: response.food_id,
      description: response.description,
      data_type: "MEXT Standard Tables",
      snapshot_sha256: snapshot.raw_sha256,
    });
    await atomicJSON(target, snapshot);
    imported++;
  }
  await atomicJSON(path.join(root, "sources/nutrition/mext/dataset.json"), {
    schema_version: 1,
    ...MEXT_DATASET,
    dataset_sha256: parsed.dataset_sha256,
  });
  return { imported, selected: ids.length };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const value = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  if (!process.argv.includes("--file") || !process.argv.includes("--ids"))
    throw new Error("用法：--file 官方xlsx路径 --ids 食品编号,食品编号");
  console.log(
    JSON.stringify(
      await importMEXT({
        file: value("--file"),
        ids: value("--ids").split(","),
      }),
    ),
  );
}
