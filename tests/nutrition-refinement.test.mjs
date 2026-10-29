import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { readJSON, nutritionRoot, sha256 } from "../scripts/nutrition-usda.mjs";
import { validateSupersessions } from "../scripts/nutrition-catalog.mjs";
import {
  validateProfile,
  readFoodSnapshot,
} from "../scripts/nutrition-model.mjs";

const load = (file) => readJSON(path.join(nutritionRoot, file));
const report = await load(
  "catalog/nutrition/reviews/source-refinement-2026-10-29.json",
);
const profiles = (await load("catalog/nutrition/profiles.json")).profiles;
const sources = (await load("catalog/howtocook.json")).recipes;

test("21篇逐篇复核，6篇换源及1篇条件修正有前后版本，旧详情仍可追溯", async () => {
  assert.deepEqual(report.counts, {
    assessed: 21,
    source_refined: 6,
    scope_corrected: 1,
    kept_proxy: 14,
    exact_identity_claimed: 0,
  });
  assert.equal(new Set(report.recipes.map((r) => r.recipe_id)).size, 21);
  validateSupersessions(profiles);
  for (const row of report.recipes) {
    assert.ok(row.remaining && row.still_food_group_proxy);
    for (const descriptor of [row.previous.details, row.current.details]) {
      const bytes = await readFile(
        path.join(nutritionRoot, "public", descriptor.path),
      );
      assert.equal(sha256(bytes), descriptor.sha256);
      assert.equal(bytes.length, descriptor.bytes);
    }
    const previous = await load("public/" + row.previous.details.path);
    const next = await load("public/" + row.current.details.path);
    assert.deepEqual(previous.per_100g, row.previous.per_100g);
    assert.deepEqual(next.per_100g, row.current.per_100g);
    if (row.status === "source_refined")
      assert.notDeepEqual(next.per_100g, previous.per_100g);
    else assert.deepEqual(next.per_100g, previous.per_100g);
    if (row.status !== "kept_proxy") {
      const oldProfile = profiles.find((p) => p.id === row.previous_profile_id);
      assert.equal(oldProfile.review.status, "withdrawn");
      assert.equal(oldProfile.review.superseded_by, row.profile_id);
      assert.ok(oldProfile.review.withdrawal_reason);
      const current = profiles.find((p) => p.id === row.profile_id);
      assert.equal(current.supersedes, oldProfile.id);
      assert.equal(current.default_for_artwork, false);
    }
  }
});

test("品牌鱼片核对同UPC和物种，糖浆及橙酒匹配实际类别，蒜苗不再以韭菜替代", async () => {
  const get = (suffix) => profiles.find((p) => p.id === `family-${suffix}-v2`);
  const fish = get("eb849be42cbb");
  assert.equal(fish.ingredients[0].food.fdc_id, 2677915);
  assert.equal(fish.ingredients[0].food.gtin_upc, "085239019023");
  assert.equal(fish.match.sauce_added, true);
  const liqueur = (await load("sources/nutrition/usda/2710623.json")).response;
  for (const description of ["curacao", "cointreau", "triple sec"])
    assert.ok(liqueur.foodAttributes.some((a) => a.value === description));
  const sunset = get("b261aa97c4ab");
  assert.ok(sunset.ingredients.some((i) => i.food.fdc_id === 168088));
  assert.ok(sunset.ingredients.some((i) => i.food.fdc_id === 2710623));
  assert.equal(sunset.match.sugar_added, true);
  assert.equal(get("45ad36b6133c").match.sugar_added, true);
  const chicken = get("280e1f88f772");
  assert.ok(chicken.ingredients.some((i) => i.food.food_id === "F054000B150a"));
  assert.ok(chicken.ingredients.some((i) => i.food.food_id === "17053"));
  assert.ok(chicken.ingredients.some((i) => i.food.fdc_id === 2028275));
  assert.equal(get("1bc98124aec5").match.sauce_added, true);
  const candidate = await load("sources/nutrition/mext/16028.json");
  const parsed = readFoodSnapshot(candidate, {
    provider: "mext",
    food_id: "16028",
    description: candidate.response.description,
    data_type: "MEXT Standard Tables",
    snapshot_sha256: candidate.raw_sha256,
  });
  assert.equal(parsed.per_100g.protein_g, null);
  assert.equal(parsed.per_100g.fat_g, null);
});

test("旧方案撤回必须有完整替代链，拒绝错菜谱、未审核替代、缺项或循环", () => {
  const old = structuredClone(
    profiles.find((p) => p.review.status === "withdrawn"),
  );
  const next = structuredClone(
    profiles.find((p) => p.id === old.review.superseded_by),
  );
  assert.doesNotThrow(() => validateSupersessions([old, next]));
  assert.throws(() => validateSupersessions([old]), /替代/);
  assert.throws(
    () => validateSupersessions([old, { ...next, recipe_id: "wrong" }]),
    /同配方/,
  );
  assert.throws(
    () =>
      validateSupersessions([old, { ...next, review: { status: "pending" } }]),
    /已审核/,
  );
  const missing = structuredClone(old);
  delete missing.review.withdrawal_reason;
  assert.throws(
    () =>
      validateProfile(
        missing,
        sources.find((r) => r.id === old.recipe_id),
      ),
    /原因/,
  );
  old.supersedes = next.id;
  next.review = { status: "withdrawn", superseded_by: old.id };
  assert.throws(() => validateSupersessions([old, next]), /循环/);
});
