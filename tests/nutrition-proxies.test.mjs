import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readJSON, nutritionRoot } from "../scripts/nutrition-usda.mjs";
import { validateProfile } from "../scripts/nutrition-model.mjs";
import { applyNutritionPlans } from "../scripts/nutrition-plans.mjs";
import { calculateNutrition } from "../src/lib/nutrition-client.mjs";

const load = (file) => readJSON(path.join(nutritionRoot, file));
const index = await load("public/nutrition/index.json");
const archive = await load(
  "catalog/nutrition/reviews/pre-generic-proxies-2026-10-29.json",
);
const backlog = await load(
  "catalog/nutrition/reviews/exact-source-backlog.json",
);
const source = await load("catalog/howtocook.json");
const details = await Promise.all(
  index.profiles
    .filter((p) => p.estimation_level === "food_group_proxy")
    .map((p) => load(`public/${p.details.path}`)),
);

test("剩余21篇逐篇有代理方案、原缺项档案及来源精化待办，不冒充原食材精确匹配", () => {
  assert.equal(details.length, 21);
  assert.deepEqual(index.reference_quality, {
    food_group_proxy: 21,
    other_available: 351,
  });
  assert.deepEqual(
    new Set(details.map((d) => d.recipe_id)),
    new Set(archive.recipes.map((r) => r.recipe_id)),
  );
  assert.equal(backlog.recipes.length, 21);
  for (const detail of details) {
    assert.equal(detail.profile.default_for_artwork, false);
    assert.equal(detail.profile.match.identity_precision, "food_group_proxy");
    assert.equal(detail.recipe_basis, "standardized_assumptions");
    assert.match(detail.scope, /代理/);
    assert.ok(detail.profile.review.checks.proxy_policy);
    assert.ok(
      backlog.recipes.some(
        (r) => r.profile_id === detail.id && r.original_gap && r.improvement,
      ),
    );
    for (const proxy of detail.profile.match.food_proxies) {
      assert.ok(proxy.target && proxy.reference_name && proxy.reason);
      assert.ok(
        detail.source_records.some((record) =>
          proxy.food.provider
            ? record.source.provider === proxy.food.provider &&
              record.source.food_id === proxy.food.food_id
            : record.source.fdc_id === proxy.food.fdc_id,
        ),
      );
    }
  }
});

test("代理营养仍按成品每100g计算，鱼肉不包含鱼骨，炸煎不计整锅油", () => {
  const fish = details.find((d) => d.recipe_id === "howtocook-eb849be42cbb");
  assert.equal(fish.profile.ingredients[0].quantity.value, 350);
  assert.equal(fish.profile.ingredients[0].food.fdc_id, 174184);
  assert.equal(fish.calculation.final_edible_g, 950);
  assert.equal(fish.per_100g.energy_kcal, 82.764211);
  const head = details.find((d) => d.recipe_id === "howtocook-961ae3ea5f72");
  assert.match(head.scope, /鱼脑、鱼皮脂肪及骨髓不在/);
  const fried = details.find((d) => d.recipe_id === "howtocook-c9b72f0464b3");
  assert.match(fried.scope, /最终留在鱼菜中的油35g/);
  for (const detail of details) {
    assert.ok(
      Object.values(detail.per_100g).every(
        (v) => v === null || (Number.isFinite(v) && v >= 0),
      ),
    );
    assert.ok(
      Math.abs(
        (detail.per_100g.energy_kcal * detail.calculation.final_edible_g) /
          100 -
          detail.calculation.total.energy_kcal,
      ) < 0.00002,
    );
  }
});

test("过滤饮品和无糖凝胶使用明示的可食代理，不把果渣或整份籽的营养计入", () => {
  const ice = details.find((d) => d.recipe_id === "howtocook-460b515020de");
  assert.equal(ice.per_100g.energy_kcal, 1.408889);
  assert.match(ice.scope, /不含红糖浆/);
  assert.equal(
    ice.profile.ingredients.find((i) => i.food.fdc_id === 170090).quantity
      .value,
    4,
  );
  const soup = details.find((d) => d.recipe_id === "howtocook-d20888ebc3bf");
  assert.equal(soup.calculation.final_edible_g, 1050);
  assert.equal(soup.per_100g.energy_kcal, 25.190476);
  assert.match(soup.scope, /不声称测得浸出率/);
  const base = details.find((d) => d.recipe_id === "howtocook-1bc98124aec5");
  assert.match(base.scope, /浓缩底料每100g/);
  assert.equal(base.calculation.final_edible_g, 300);
});

test("Mealora原字段获取代理结果和标记，仍保留标准方案选择及独立匹配", () => {
  for (const detail of details) {
    const profile = index.recipes.find(
      (r) => r.recipe_id === detail.recipe_id,
    ).nutrition;
    assert.equal(
      calculateNutrition(profile, 150, { confirmedProfileId: profile.id })
        .reason,
      "standard_recipe_not_accepted",
    );
    const result = calculateNutrition(profile, 150, {
      confirmedProfileId: profile.id,
      acceptStandardRecipe: true,
      acceptAssumedWeight: true,
    });
    assert.equal(result.status, "available");
    assert.equal(result.estimation_level, "food_group_proxy");
    assert.ok(
      Math.abs(
        result.portion.nutrients.energy_kcal -
          profile.per_100g.energy_kcal * 1.5,
      ) < 0.000001,
    );
  }
});

test("未披露或没有实际食材来源的代理不能通过校验，不得成为插画默认营养", () => {
  const original = details[0].profile;
  const recipe = source.recipes.find((r) => r.id === original.recipe_id);
  for (const mutate of [
    (p) => (p.default_for_artwork = true),
    (p) => (p.match.identity_precision = "exact"),
    (p) => (p.match.food_proxies = []),
    (p) => (p.match.food_proxies[0].food.fdc_id = 999999999),
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => validateProfile(changed, recipe), /代理/);
  }
});

test("全部代理方案断点重跑不重复、不改写已发布的来源和审核记录", async () => {
  const before = await load("catalog/nutrition/profiles.json");
  assert.equal((await applyNutritionPlans()).added, 0);
  assert.deepEqual(await load("catalog/nutrition/profiles.json"), before);
});
