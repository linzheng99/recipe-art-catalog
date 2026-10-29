import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  loadNutritionIndex,
  findNutritionProfiles,
  calculateNutrition,
  loadNutritionDetails,
} from "../src/lib/nutrition-client.mjs";

const base = "https://example.test/recipe-art-catalog/";
const manifestURL = base + "manifest-lite.json";
const fixture = JSON.parse(
  await readFile(new URL("../public/manifest-lite.json", import.meta.url)),
);
const index = JSON.parse(
  await readFile(new URL("../public/nutrition/index.json", import.meta.url)),
);
const fetchLocal = async (url) => {
  const relative = String(url).replace(base, "");
  if (!String(url).startsWith(base) || relative.includes(".."))
    throw new Error("invalid URL");
  try {
    return new Response(
      await readFile(new URL("../public/" + relative, import.meta.url)),
      { headers: { "content-type": "application/json" } },
    );
  } catch {
    return new Response("missing", { status: 404 });
  }
};

test("Mealora真实JSON接入：仓库子目录读取、按recipe_id选方案、150g换算并校验溯源摘要", async () => {
  const loaded = await loadNutritionIndex(manifestURL, {
    fetchImpl: fetchLocal,
  });
  assert.equal(loaded.status, "available");
  const found = findNutritionProfiles(loaded, {
    recipeId: "howtocook-b13f782654bf",
  });
  assert.equal(found.status, "needs_match_confirmation");
  assert.equal(found.candidates.length, 1);
  const profile = found.candidates[0];
  assert.equal(
    calculateNutrition(profile, 150).reason,
    "independent_match_not_confirmed",
  );
  assert.equal(
    calculateNutrition(profile, 150, { confirmedProfileId: profile.id }).reason,
    "standard_recipe_not_accepted",
  );
  assert.equal(
    calculateNutrition(profile, 150, {
      confirmedProfileId: profile.id,
      acceptStandardRecipe: true,
    }).reason,
    "assumed_finished_weight_not_accepted",
  );
  const result = calculateNutrition(profile, 150, {
    confirmedProfileId: profile.id,
    acceptStandardRecipe: true,
    acceptAssumedWeight: true,
  });
  assert.equal(result.status, "available");
  assert.ok(Math.abs(result.portion.nutrients.energy_kcal - 89.375) < 0.00001);
  assert.equal(result.source.fdc_ids[0], 171287);
  assert.equal(
    (await loadNutritionDetails(loaded, profile, { fetchImpl: fetchLocal }))
      .status,
    "available",
  );
  assert.equal(
    findNutritionProfiles(loaded, {
      recipeId: profile.recipe_id,
      recipeBlobSha: "0".repeat(40),
    }).fallback,
    "USDA",
  );
  assert.equal(findNutritionProfiles(loaded, {}).reason, "recipe_id_required");
});

test("目录未发布、网络失败、版本混合、候选未审核都明确回退USDA", async () => {
  assert.equal(
    (
      await loadNutritionIndex(manifestURL, {
        fetchImpl: async () => Response.json({ schema_version: 1 }),
      })
    ).reason,
    "nutrition_not_published",
  );
  assert.equal(
    (
      await loadNutritionIndex(manifestURL, {
        fetchImpl: async () => new Response("missing", { status: 404 }),
      })
    ).reason,
    "catalog_request_failed",
  );
  assert.equal(
    (
      await loadNutritionIndex(manifestURL, {
        fetchImpl: async (url) =>
          Response.json(
            String(url).endsWith("manifest-lite.json")
              ? fixture
              : { ...index, version: "wrong" },
          ),
      })
    ).reason,
    "invalid_or_mixed_version",
  );
  for (const bad of [
    { ...index, recipes: [{ recipe_id: "broken", profile_ids: null }] },
    { ...index, profiles: [index.profiles[0], index.profiles[0]] },
  ])
    assert.equal(
      (
        await loadNutritionIndex(manifestURL, {
          fetchImpl: async (url) =>
            Response.json(
              String(url).endsWith("manifest-lite.json") ? fixture : bad,
            ),
        })
      ).reason,
      "invalid_or_mixed_version",
    );
  const profile = structuredClone(index.profiles[0]);
  profile.review_status = "pending";
  assert.equal(
    calculateNutrition(profile, 100, { confirmedProfileId: profile.id }).reason,
    "invalid_reference",
  );
});

test("每个营养素独立处理未知与0，拒绝非法克数、溢出和被篡改的详情", async () => {
  const loaded = await loadNutritionIndex(manifestURL, {
    fetchImpl: fetchLocal,
  });
  const profile = structuredClone(index.profiles[0]);
  profile.per_100g = {
    energy_kcal: null,
    protein_g: 3.41,
    carbohydrate_g: null,
    fat_g: 0,
  };
  const result = calculateNutrition(profile, 200, {
    confirmedProfileId: profile.id,
  });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.portion.nutrients, {
    energy_kcal: null,
    protein_g: 6.82,
    carbohydrate_g: null,
    fat_g: 0,
  });
  assert.deepEqual(result.missing_nutrients, ["energy_kcal", "carbohydrate_g"]);
  for (const grams of [0, -1, NaN, Infinity])
    assert.throws(() => calculateNutrition(profile, grams), /有限正数/);
  assert.equal(
    calculateNutrition(index.profiles[0], Number.MAX_VALUE, {
      confirmedProfileId: index.profiles[0].id,
    }).reason,
    "calculation_overflow",
  );
  assert.equal(
    (
      await loadNutritionDetails(loaded, index.profiles[0], {
        fetchImpl: async () => Response.json({ fake: true }),
      })
    ).reason,
    "detail_integrity_failed",
  );
});
