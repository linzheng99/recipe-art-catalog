import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readJSON, nutritionRoot, sha256 } from "../scripts/nutrition-usda.mjs";
import { importKRDA, KRDA_DATASET } from "../scripts/nutrition-krda.mjs";
import {
  readFoodSnapshot,
  foodReferenceKey,
} from "../scripts/nutrition-model.mjs";
import { calculateNutrition } from "../src/lib/nutrition-client.mjs";
const load = (file) => readJSON(path.join(nutritionRoot, file));
const eel = await load("sources/nutrition/krda/K0600000000a.json");
const expected = (data) => ({
  provider: "krda",
  food_id: data.response.food_id,
  description: data.response.description,
  data_type: "KRDA Standard Food Composition DB",
  snapshot_sha256: data.raw_sha256,
});
const changed = (fn) => {
  const s = structuredClone(eel);
  fn(s);
  s.raw_sha256 = sha256(JSON.stringify(s.response));
  return s;
};

test("韩国年度DB按食品码连接10.4索引、学名与100g可食部，不把黄鳝当鳗鱼", async () => {
  const food = readFoodSnapshot(eel, expected(eel));
  assert.equal(food.source.scientific_name, "Monopterus albus");
  assert.deepEqual(food.per_100g, {
    energy_kcal: 92,
    protein_g: 17.9,
    carbohydrate_g: 0,
    fat_g: 1.7,
  });
  assert.equal(food.source.license.name, "KOGL Type 1 (attribution)");
  assert.equal(foodReferenceKey(expected(eel)), "krda:K0600000000a");
  assert.ok(!Number.isSafeInteger(food.source.food_id));
  const snail = await load("sources/nutrition/krda/K4190010000a.json");
  assert.equal(
    readFoodSnapshot(snail, expected(snail)).source.scientific_name,
    "Cipangopaludina chinensis malleata",
  );
  const catfish = await load("sources/nutrition/krda/K0580000000a.json");
  assert.equal(
    readFoodSnapshot(catfish, expected(catfish)).source.scientific_name,
    "Pseudobagrus fulvidraco",
  );
});

test("魔芋蛋糕核对同UPC的赤藓糖醇和纯塔塔粉，总碳水含糖醇且不按4/4/9改写能量", async () => {
  const index = await load("public/nutrition/index.json");
  const profile = index.profiles.find(
    (p) => p.recipe_id === "howtocook-1282bbd3a9c9",
  );
  const detail = await load(`public/${profile.details.path}`);
  const sweetener = detail.source_records.find(
    (r) => r.source.fdc_id === 2386683,
  );
  assert.equal(sweetener.source.gtin_upc, "733739069276");
  assert.equal(sweetener.source.ingredients, "ERYTHRITOL.");
  assert.deepEqual(sweetener.per_100g, {
    energy_kcal: 0,
    protein_g: 0,
    carbohydrate_g: 100,
    fat_g: 0,
  });
  assert.ok(profile.source.fdc_ids.includes(175041));
  assert.deepEqual(profile.source.food_ids, [
    { provider: "mext", id: "02002" },
  ]);
  assert.equal(detail.calculation.final_edible_g, 190);
  assert.match(profile.scope, /总碳水.*糖醇/);
  assert.ok(profile.match.brand.includes("733739069276"));
  assert.ok(
    profile.per_100g.energy_kcal <
      profile.per_100g.carbohydrate_g * 4 +
        profile.per_100g.protein_g * 4 +
        profile.per_100g.fat_g * 9,
  );
  assert.ok(
    detail.profile.review.evidence.some(
      (e) =>
        e.url === "https://www.nowfoods.com/products/natural-foods/erythritol",
    ),
  );
});

test("韩国缓存的缺值独立为null，食品码、版本、单位、索引或摘要改变均拒绝", () => {
  const missing = changed((s) => (s.response.cells.H = "-"));
  const food = readFoodSnapshot(missing, expected(missing));
  assert.equal(food.per_100g.protein_g, null);
  assert.equal(food.per_100g.carbohydrate_g, 0);
  for (const mutate of [
    (s) => (s.response.header_units.F = "kJ"),
    (s) => (s.response.identity_evidence.cells.A = "wrong"),
    (s) => (s.response.cells.D = "wrong"),
    (s) => (s.release = "10.0"),
    (s) => (s.response.cells.I = "-1"),
    (s) => (s.response.cells.H = "NaN"),
  ]) {
    const data = changed(mutate);
    assert.throws(() => readFoodSnapshot(data, expected(data)));
  }
  assert.throws(
    () =>
      readFoodSnapshot(eel, {
        ...expected(eel),
        snapshot_sha256: "0".repeat(64),
      }),
    /摘要/,
  );
  assert.throws(
    () => foodReferenceKey({ provider: "krda", food_id: "../cache" }),
    /编号/,
  );
});

test("韩国来源混合USDA配方每100g与整份一致，Mealora原字段可用且无插画默认", async () => {
  const index = await load("public/nutrition/index.json");
  const profile = index.profiles.find(
    (p) => p.recipe_id === "howtocook-b9a1d9770073",
  );
  assert.equal(profile.method, "recipe_estimate");
  assert.deepEqual(profile.source.food_ids, [
    { provider: "krda", id: "K0600000000a" },
  ]);
  const detail = await load(`public/${profile.details.path}`);
  assert.equal(detail.calculation.final_edible_g, 600);
  assert.ok(
    Math.abs(
      profile.per_100g.energy_kcal * 6 - detail.calculation.total.energy_kcal,
    ) < 0.00001,
  );
  const result = calculateNutrition(profile, 150, {
    confirmedProfileId: profile.id,
    acceptStandardRecipe: true,
    acceptAssumedWeight: true,
  });
  assert.equal(result.status, "available");
  assert.ok(
    Math.abs(result.portion.nutrients.energy_kcal - 232.2325) < 0.00001,
  );
  const recipe = index.recipes.find((r) => r.recipe_id === profile.recipe_id);
  assert.deepEqual(recipe.nutrition.per_100g, profile.per_100g);
  const manifest = await load("public/manifest.json");
  assert.equal(
    manifest.artworks.find((a) => a.recipe_ids.includes(profile.recipe_id))
      .nutrition.status,
    "unknown",
  );
  for (const providers of [undefined, {}, ["mext"]]) {
    const invalid = structuredClone(profile);
    invalid.source.providers = providers;
    assert.equal(
      calculateNutrition(invalid, 100, { confirmedProfileId: profile.id })
        .reason,
      "invalid_reference",
    );
  }
});

test("KRDA完整原表导入断点重跑不会重复或覆盖，损坏和不存在食品码不破坏缓存", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recipe-krda-"));
  try {
    const file = path.join(nutritionRoot, KRDA_DATASET.dataset_path),
      ids = ["K0600000000a"];
    assert.equal((await importKRDA({ file, ids, root })).imported, 1);
    const target = path.join(root, "sources/nutrition/krda/K0600000000a.json"),
      before = await readFile(target, "utf8");
    assert.equal((await importKRDA({ file, ids, root })).imported, 0);
    assert.equal(await readFile(target, "utf8"), before);
    await assert.rejects(
      importKRDA({ file, ids: ["K0000000000a"], root }),
      /提取失败/,
    );
    const broken = path.join(root, "broken.xlsx");
    await writeFile(broken, "incomplete download");
    await assert.rejects(importKRDA({ file: broken, ids, root }), /提取失败/);
    assert.equal(await readFile(target, "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
