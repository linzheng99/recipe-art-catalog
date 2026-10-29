import { createHash } from "node:crypto";

export function createNutritionLite(index) {
  const { profiles, recipes, ...metadata } = index;
  const document = {
    ...metadata,
    format: "nutrition-lite",
    recipes: recipes.map((row) => {
      const alternatives = profiles.filter(
        (profile) =>
          profile.recipe_id === row.recipe_id &&
          row.profile_ids.includes(profile.id) &&
          profile.id !== row.nutrition.profile_id,
      );
      return {
        recipe_id: row.recipe_id,
        artwork_key: row.artwork_key,
        name: row.name,
        status: row.status,
        review_status: row.review_status,
        profile_ids: row.profile_ids,
        nutrition: row.nutrition,
        ...(alternatives.length ? { nutrition_profiles: alternatives } : {}),
      };
    }),
  };
  const text = JSON.stringify(document) + "\n";
  return {
    document,
    text,
    descriptor: {
      path: "nutrition/index-lite.json",
      bytes: Buffer.byteLength(text),
      sha256: createHash("sha256").update(text).digest("hex"),
    },
  };
}
