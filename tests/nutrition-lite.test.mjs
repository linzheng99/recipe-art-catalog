import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createNutritionLite } from "../scripts/nutrition-lite.mjs";
import {
  loadNutritionIndex,
  findNutritionProfiles,
  calculateNutrition,
} from "../src/lib/nutrition-client.mjs";

const root = new URL("../public/", import.meta.url);
const fullText = await readFile(new URL("nutrition/index.json", root), "utf8");
const full = JSON.parse(fullText);
const manifest = JSON.parse(
  await readFile(new URL("manifest-lite.json", root)),
);
const base = "https://example.test/recipe-art-catalog/";
const fetchLocal = async (url) =>
  new Response(await readFile(new URL(String(url).replace(base, ""), root)));

test("轻量营养保留全部运行时条件、未知值和同图独立配方，体积小于完整入口45%", async () => {
  const lite = createNutritionLite(full);
  assert.ok(Buffer.byteLength(lite.text) < Buffer.byteLength(fullText) * 0.45);
  assert.equal(lite.document.recipes.length, 372);
  assert.equal(lite.document.version, full.version);
  assert.equal(lite.document.profiles, undefined);
  for (const row of lite.document.recipes) {
    const original = full.recipes.find((r) => r.recipe_id === row.recipe_id);
    assert.deepEqual(row.nutrition, original.nutrition);
    assert.deepEqual(row.profile_ids, original.profile_ids);
    assert.equal(row.candidate_fdc_ids, undefined);
  }
  const calls = [];
  const loaded = await loadNutritionIndex(base + "manifest-lite.json", {
    fetchImpl: async (url) => {
      calls.push(String(url));
      return fetchLocal(url);
    },
  });
  assert.equal(loaded.status, "available");
  assert.deepEqual(calls, [
    base + "manifest-lite.json",
    base + "nutrition/index-lite.json",
  ]);
  assert.equal(loaded.index.profiles.length, full.profiles.length);
  const result = findNutritionProfiles(loaded, {
    recipeId: "howtocook-eb849be42cbb",
  });
  assert.equal(result.candidates[0].estimation_level, "food_group_proxy");
  const p = result.candidates[0];
  assert.equal(
    calculateNutrition(p, 150, {
      confirmedProfileId: p.id,
      acceptStandardRecipe: true,
      acceptAssumedWeight: true,
    }).status,
    "available",
  );
});

test("兼容旧完整入口，拒绝轻量摘要损坏；多方案不静默选择默认值", async () => {
  const old = structuredClone(manifest);
  delete old.nutrition_catalog.lite;
  const loaded = await loadNutritionIndex(base + "manifest-lite.json", {
    fetchImpl: (url) =>
      String(url).endsWith("manifest-lite.json")
        ? Promise.resolve(Response.json(old))
        : fetchLocal(url),
  });
  assert.equal(loaded.status, "available");
  assert.deepEqual(loaded.index, full);
  const damaged = await loadNutritionIndex(base + "manifest-lite.json", {
    fetchImpl: (url) =>
      String(url).endsWith("index-lite.json")
        ? Promise.resolve(
            Response.json({ format: "nutrition-lite", recipes: [] }),
          )
        : fetchLocal(url),
  });
  assert.equal(damaged.status, "fallback");
  const row = structuredClone(full.recipes[0]);
  const first = { ...full.profiles[0], recipe_id: row.recipe_id };
  const second = { ...first, id: "alternate-test" };
  row.profile_ids = [first.id, second.id];
  row.nutrition = { status: "unknown", per_100g: { energy_kcal: null } };
  const multi = createNutritionLite({
    ...full,
    profiles: [first, second],
    recipes: [row],
  });
  assert.equal(multi.document.recipes[0].nutrition.status, "unknown");
  assert.equal(multi.document.recipes[0].nutrition_profiles.length, 2);
});
