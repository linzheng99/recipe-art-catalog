import path from "node:path";
import { readFile, copyFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  atomicJSON,
  readJSON,
  sha256,
  nutritionRoot,
} from "./nutrition-usda.mjs";

export const KRDA_DATASET = {
  provider: "krda",
  name: "韩国 RDA 国家标准食物成分 DB",
  release: "국가표준식품성분 Database 10.4",
  url: "https://www.nics.go.kr/food/kfi/fct/fctIntro/downloadImg.do",
  landing_url: "https://www.nics.go.kr/food/kfi/fct/fctIntro/list",
  dataset_path: "sources/nutrition/krda/datasets/composition-10.4.xlsx",
  license: {
    name: "KOGL Type 1 (attribution)",
    url: "https://www.nics.go.kr/food/kfi/fct/fctIntro/list",
    attribution:
      "출처: 농촌진흥청 국가표준식품성분 DB 10.4. 本项目提取并计算，非韩国官方产品。",
  },
  download_form: {
    gubun: "EXCEL",
    usepurps: "704009",
    occpgrupp: "704022",
    occpgruppEtc: "AI assistant for public nutrition catalog development",
  },
};
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
export const validKRDAID = (id) =>
  typeof id === "string" && /^[A-Z][a-zA-Z0-9]{11}$/.test(id);
const fields = {
  energy_kcal: ["F", "에너지", "kcal"],
  protein_g: ["H", "단백질", "g"],
  carbohydrate_g: ["K", "탄수화물", "g"],
  fat_g: ["I", "지방", "g"],
};
export function readKRDASnapshot(snapshot, expected) {
  ensure(
    snapshot?.schema_version === 1 &&
      snapshot.provider === "krda" &&
      expected.provider === "krda" &&
      validKRDAID(expected.food_id),
    "KRDA来源或食品码无效",
  );
  const food = snapshot.response;
  ensure(
    snapshot.raw_sha256 === sha256(JSON.stringify(food)) &&
      expected.snapshot_sha256 === snapshot.raw_sha256,
    "KRDA原始缓存摘要不一致",
  );
  const identity = food.identity_evidence?.cells;
  ensure(
    food.food_id === expected.food_id &&
      food.description === expected.description &&
      food.cells.D === expected.description &&
      identity?.B === expected.food_id &&
      identity.C === expected.description &&
      identity.A === food.cells.A &&
      expected.data_type === "KRDA Standard Food Composition DB",
    "KRDA食品身份、原表索引或数据类型不一致",
  );
  ensure(
    snapshot.release === KRDA_DATASET.release &&
      food.sheet_name === KRDA_DATASET.release &&
      snapshot.dataset_url === KRDA_DATASET.url &&
      /^[a-f0-9]{64}$/.test(snapshot.dataset_sha256) &&
      Number.isFinite(Date.parse(snapshot.retrieved_at)),
    "KRDA版本、原表摘要或获取日期无效",
  );
  ensure(
    food.basis_header === "가식부 100g 당 (per 100g Edible Portion)",
    "KRDA每100g可食部基准变化",
  );
  const values = {},
    evidence = {};
  for (const [key, [column, identifier, unit]] of Object.entries(fields)) {
    ensure(
      food.header_cells[column]?.trim() === identifier &&
        food.header_units[column] === unit,
      "KRDA营养列或单位变化",
    );
    const raw = String(food.cells[column] ?? "").trim();
    const value = ["", "-", "Tr", "TR"].includes(raw)
      ? null
      : /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(raw)
        ? Number(raw)
        : NaN;
    ensure(
      value === null ||
        (Number.isFinite(value) &&
          value >= 0 &&
          value <= (unit === "g" ? 100 : 1000)),
      "KRDA营养数值格式或范围错误",
    );
    values[key] = value;
    evidence[key] = {
      column,
      identifier,
      cell: `${column}${food.row_number}`,
      unit,
      raw_value: raw,
      amount_per_100g: value,
    };
  }
  ensure(
    ["protein_g", "carbohydrate_g", "fat_g"].reduce(
      (sum, key) => sum + (values[key] ?? 0),
      0,
    ) <= 105,
    "KRDA已知宏量营养超过质量上限",
  );
  return {
    per_100g: values,
    nutrient_evidence: evidence,
    source: {
      provider: "krda",
      name: KRDA_DATASET.name,
      food_id: food.food_id,
      description: food.description,
      english_name: food.english_name,
      scientific_name: food.scientific_name,
      data_type: expected.data_type,
      retrieved_at: snapshot.retrieved_at,
      url: KRDA_DATASET.landing_url,
      version: `${snapshot.release} / ${snapshot.raw_sha256.slice(0, 16)}`,
      raw_sha256: snapshot.raw_sha256,
      transport: "official_bulk_xlsx",
      dataset_url: snapshot.dataset_url,
      dataset_sha256: snapshot.dataset_sha256,
      sheet_name: food.sheet_name,
      row_number: food.row_number,
      original_source: food.cells.E,
      identity_evidence: food.identity_evidence,
      license: KRDA_DATASET.license,
      nutrient_definition: {
        carbohydrate_g: "保留韩国成分表总碳水口径",
        energy_kcal: "保留韩国成分表热量；不按4/4/9改写",
      },
    },
  };
}
export async function importKRDA({
  file,
  ids,
  root = nutritionRoot,
  retrievedAt = new Date().toISOString(),
}) {
  ensure(
    Array.isArray(ids) &&
      ids.length &&
      ids.every(validKRDAID) &&
      new Set(ids).size === ids.length,
    "须显式指定不重复的KRDA食品码",
  );
  const bytes = await readFile(file),
    digest = sha256(bytes),
    output = path.join(root, ".cache/nutrition/krda/import.json");
  const extract = spawnSync(
    "python3",
    [
      path.join(nutritionRoot, "scripts/nutrition-krda-extract.py"),
      file,
      "--ids",
      ids.join(","),
      "--output",
      output,
    ],
    { encoding: "utf8" },
  );
  ensure(extract.status === 0, "KRDA原表提取失败，未覆盖已有数据");
  const parsed = await readJSON(output);
  ensure(parsed.dataset_sha256 === digest, "KRDA原表文件摘要不符");
  const pending = [];
  for (const response of parsed.foods) {
    const snapshot = {
      schema_version: 1,
      provider: "krda",
      transport: "official_bulk_xlsx",
      dataset_url: KRDA_DATASET.url,
      dataset_sha256: digest,
      release: KRDA_DATASET.release,
      retrieved_at: retrievedAt,
      raw_sha256: sha256(JSON.stringify(response)),
      response,
    };
    readKRDASnapshot(snapshot, {
      provider: "krda",
      food_id: response.food_id,
      description: response.description,
      data_type: "KRDA Standard Food Composition DB",
      snapshot_sha256: snapshot.raw_sha256,
    });
    const target = path.join(
      root,
      "sources/nutrition/krda",
      `${response.food_id}.json`,
    );
    try {
      const existing = await readJSON(target);
      ensure(
        existing.raw_sha256 === snapshot.raw_sha256 &&
          existing.dataset_sha256 === digest,
        "KRDA同版本快照变化，须先审核来源升级",
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      pending.push({ target, snapshot });
    }
  }
  const dataset = path.join(root, KRDA_DATASET.dataset_path);
  await mkdir(path.dirname(dataset), { recursive: true });
  try {
    ensure(
      sha256(await readFile(dataset)) === digest,
      "KRDA同版本原表变化，须显式升级",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await copyFile(file, dataset);
  }
  for (const item of pending) await atomicJSON(item.target, item.snapshot);
  await atomicJSON(path.join(root, "sources/nutrition/krda/dataset.json"), {
    schema_version: 1,
    ...KRDA_DATASET,
    dataset_sha256: digest,
  });
  return { imported: pending.length, selected: ids.length };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const value = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  if (!process.argv.includes("--file") || !process.argv.includes("--ids"))
    throw new Error("用法：--file 官方年度xlsx路径 --ids 食品码,食品码");
  console.log(
    JSON.stringify(
      await importKRDA({
        file: value("--file"),
        ids: value("--ids").split(","),
      }),
    ),
  );
}
