import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { nutritionRoot, readJSON, sha256 } from "../scripts/nutrition-usda.mjs";
import {
  readFoodSnapshot,
  calculateRecipe,
  foodReferenceKey,
} from "../scripts/nutrition-model.mjs";
import { importMEXT, MEXT_DATASET } from "../scripts/nutrition-composition.mjs";
import { calculateNutrition } from "../src/lib/nutrition-client.mjs";
const load = (file) => readJSON(path.join(nutritionRoot, file));
const index = await load("public/nutrition/index.json");
const snapshot = await load("sources/nutrition/mext/06207.json");
const expected = (source) => ({
  provider: "mext",
  food_id: source.response.food_id,
  description: source.response.description,
  data_type: "MEXT Standard Tables",
  snapshot_sha256: source.raw_sha256,
});
const changed = (change) => {
  const copy = structuredClone(snapshot);
  change(copy);
  copy.raw_sha256 = sha256(JSON.stringify(copy.response));
  return copy;
};

test("官方原表按食品编号、营养素标识和每100g可食部解析，区别叶片与花茎", async () => {
  assert.deepEqual(readFoodSnapshot(snapshot, expected(snapshot)).per_100g, {
    energy_kcal: 18,
    protein_g: 1.7,
    carbohydrate_g: 4,
    fat_g: 0.3,
  });
  const scape = await load("sources/nutrition/mext/06224.json");
  assert.deepEqual(readFoodSnapshot(scape, expected(scape)).per_100g, {
    energy_kcal: 44,
    protein_g: 1.9,
    carbohydrate_g: 10.6,
    fat_g: 0.3,
  });
  const result = readFoodSnapshot(snapshot, expected(snapshot));
  assert.equal(result.nutrient_evidence.protein_g.identifier, "PROT-");
  assert.equal(result.nutrient_evidence.carbohydrate_g.identifier, "CHOCDF-");
  assert.equal(result.source.food_id, "06207");
  assert.match(result.source.license.attribution, /文部科学省/);
  assert.equal(foodReferenceKey(expected(snapshot)), "mext:06207");
  assert.throws(
    () => foodReferenceKey({ provider: "../private", food_id: "06207" }),
    /来源或食品编号/,
  );
});

test("MEXT痕量和未给值保持null，明确的0与括号推定值独立处理", () => {
  for (const raw of ["Tr", "-", "(Tr)"]) {
    const data = changed((s) => (s.response.cells.M = raw));
    const food = readFoodSnapshot(data, expected(data));
    assert.equal(food.per_100g.fat_g, null);
    assert.equal(food.per_100g.protein_g, 1.7);
    const calculation = calculateRecipe(
      [
        {
          name: "韭菜",
          source_state: "raw",
          quantity: {
            value: 100,
            unit: "g",
            edible: true,
            state: "raw",
            evidence: "明确净重",
          },
          per_100g: food.per_100g,
        },
      ],
      { grams: 100, method: "cold_mix_mass_balance", evidence: "全部净重" },
      { no_heating_after_weighing: true, all_edible_material_retained: true },
    );
    assert.equal(calculation.per_100g.fat_g, null);
    assert.equal(calculation.per_100g.protein_g, 1.7);
  }
  const zero = changed((s) => (s.response.cells.M = "0"));
  assert.equal(readFoodSnapshot(zero, expected(zero)).per_100g.fat_g, 0);
  const assumed = changed((s) => (s.response.cells.M = "(0.3)"));
  assert.equal(
    readFoodSnapshot(assumed, expected(assumed)).nutrient_evidence.fat_g
      .estimated_in_source,
    true,
  );
});

test("拒绝错误食品编号、来源摘要、单位、营养素列和非法营养数字", () => {
  assert.throws(
    () =>
      readFoodSnapshot(snapshot, { ...expected(snapshot), food_id: "06224" }),
    /编号/,
  );
  assert.throws(
    () =>
      readFoodSnapshot(snapshot, {
        ...expected(snapshot),
        snapshot_sha256: "0".repeat(64),
      }),
    /摘要/,
  );
  for (const change of [
    (s) => (s.response.header_units.G = "kJ"),
    (s) => (s.response.header_cells.U = "CHOAVL"),
    (s) => (s.response.cells.J = "-1"),
    (s) => (s.response.cells.G = "Infinity"),
    (s) => (s.response.cells.M = "1000"),
  ]) {
    const data = changed(change);
    assert.throws(
      () => readFoodSnapshot(data, expected(data)),
      /单位|营养素列|数值|数值格式|营养值/,
    );
  }
});

test("真实混合来源配方保留USDA编号和MEXT编号，整份与每100g计算可复核", async () => {
  const profile = index.profiles.find(
    (p) => p.recipe_id === "howtocook-cf76d9b00d1d",
  );
  assert.equal(profile.method, "recipe_estimate");
  assert.deepEqual(profile.source.food_ids, [
    { provider: "mext", id: "06207" },
  ]);
  assert.ok(profile.source.fdc_ids.length > 0);
  assert.ok(!profile.source.fdc_ids.includes(6207));
  const detail = await load(`public/${profile.details.path}`);
  assert.equal(detail.calculation.total.energy_kcal, 498.8);
  assert.equal(detail.calculation.final_edible_g, 360);
  assert.equal(profile.per_100g.energy_kcal, 138.555556);
  assert.equal(detail.source_records[0].source.provider, "mext");
  assert.ok(
    detail.source_records.some((r) => Number.isSafeInteger(r.source.fdc_id)),
  );
  const result = calculateNutrition(profile, 180, {
    confirmedProfileId: profile.id,
    acceptStandardRecipe: true,
    acceptAssumedWeight: true,
  });
  assert.equal(result.status, "available");
  assert.ok(Math.abs(result.portion.nutrients.energy_kcal - 249.4) < 0.00001);
  const broken = structuredClone(profile);
  broken.source.food_ids[0].id = "unknown";
  assert.equal(
    calculateNutrition(broken, 180, { confirmedProfileId: profile.id }).reason,
    "invalid_reference",
  );
});

test("官方原表离线导入可重跑，不重复或覆盖快照，损坏文件不破坏已有数据", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recipe-mext-test-"));
  try {
    const file = path.join(nutritionRoot, MEXT_DATASET.dataset_path);
    assert.equal(
      (await importMEXT({ file, ids: ["06207"], root })).imported,
      1,
    );
    const record = path.join(root, "sources/nutrition/mext/06207.json");
    const before = await readFile(record, "utf8");
    assert.equal(
      (await importMEXT({ file, ids: ["06207"], root })).imported,
      0,
    );
    assert.equal(await readFile(record, "utf8"), before);
    const bad = path.join(root, "invalid.xlsx");
    await writeFile(bad, "not an xlsx");
    await assert.rejects(
      importMEXT({ file: bad, ids: ["06207"], root }),
      /提取失败/,
    );
    assert.equal(await readFile(record, "utf8"), before);
    await assert.rejects(
      importMEXT({ file, ids: ["06207", "06207"], root }),
      /不重复/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
