import {
  getCatalogURL,
  parseRecipeDescriptor,
  parseReferenceRecipes,
  parseNutrition,
} from "@/lib/catalog";
import type { Artwork, ReferenceRecipe } from "@/lib/catalog";

export function recipeDetailsCacheKey(item: Artwork) {
  return `${item.key}:${item.recipe_details?.sha256 ?? "inline"}`;
}

export function parseRecipeDetails(value: unknown, item: Artwork) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("schema_version" in value) ||
    value.schema_version !== 1 ||
    !("key" in value) ||
    value.key !== item.key ||
    !("reference_recipes" in value)
  )
    throw new Error("Invalid recipe details");
  const recipes = parseReferenceRecipes(value.reference_recipes);
  if (
    recipes.length !== item.reference_recipes.length ||
    !recipes.some((recipe) => recipe.details) ||
    recipes.some((recipe, index) => {
      const expected = item.reference_recipes[index];
      return (
        recipe.id !== expected.id ||
        recipe.name !== expected.name ||
        recipe.url !== expected.url
      );
    })
  )
    throw new Error("Recipe source mismatch");
  return recipes;
}

export type RecipeData = {
  recipes: ReferenceRecipe[];
  nutrition?: Artwork["nutrition"];
  nutrition_profiles?: Artwork["nutrition_profiles"];
};

export function parseRecipeData(value: unknown, item: Artwork): RecipeData {
  const recipes = parseRecipeDetails(value, item);
  const data = value as Record<string, unknown>;
  const result: RecipeData = { recipes };
  const profileID = (nutrition: Artwork["nutrition"]) =>
    nutrition.profile_id ?? ("id" in nutrition ? nutrition.id : undefined);
  const sameReference = (
    a: Artwork["nutrition"],
    b: Artwork["nutrition"],
    legacyVersionAlias = false,
  ) =>
    profileID(a) === profileID(b) &&
    a.status === b.status &&
    a.method === b.method &&
    a.source?.url === b.source?.url &&
    (legacyVersionAlias || a.source?.version === b.source?.version) &&
    Object.entries(a.per_100g).every(
      ([key, value]) => value === b.per_100g[key as keyof typeof b.per_100g],
    );
  if (data.nutrition !== undefined) {
    result.nutrition = parseNutrition(data.nutrition);
    if (!sameReference(result.nutrition, item.nutrition))
      throw new Error("Nutrition source mismatch");
  }
  if (data.nutrition_profiles !== undefined) {
    if (!Array.isArray(data.nutrition_profiles))
      throw new Error("Invalid nutrition profiles");
    result.nutrition_profiles = data.nutrition_profiles.map(
      parseNutrition,
    ) as Artwork["nutrition_profiles"];
    const ids = new Set();
    for (const profile of result.nutrition_profiles ?? []) {
      if (
        ids.has(profile.id) ||
        !item.reference_recipes.some(
          (recipe) => recipe.id === profile.recipe_id,
        )
      )
        throw new Error("Nutrition recipe mismatch");
      ids.add(profile.id);
      const listed = item.nutrition_profiles?.find(
        (entry) => entry.id === profile.id,
      );
      const expected =
        listed ??
        (profile.id === item.nutrition.profile_id ? item.nutrition : undefined);
      // 旧默认营养保留历史来源版本；完整方案有新的计算规则版本，数值仍须逐项一致。
      if (
        !expected ||
        !sameReference(
          profile,
          expected,
          !listed && result.nutrition !== undefined,
        )
      )
        throw new Error("Nutrition profile mismatch");
    }
    for (const expected of item.nutrition_profiles ?? []) {
      const found = result.nutrition_profiles?.find(
        (profile) => profile.id === expected.id,
      );
      if (!found || !sameReference(found, expected))
        throw new Error("Nutrition profile mismatch");
    }
  }
  return result;
}

export async function fetchRecipeData(item: Artwork): Promise<RecipeData> {
  if (!item.recipe_details) return { recipes: item.reference_recipes };
  const descriptor = parseRecipeDescriptor(item.recipe_details, item.key);
  const response = await fetch(new URL(descriptor.path, getCatalogURL()), {
    signal: AbortSignal.timeout(10000),
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Recipe unavailable");
  const data = await response.arrayBuffer();
  if (data.byteLength !== descriptor.bytes)
    throw new Error("Recipe size mismatch");
  const digest = await crypto.subtle.digest("SHA-256", data);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (sha256 !== descriptor.sha256) throw new Error("Recipe digest mismatch");
  return parseRecipeData(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)),
    item,
  );
}

export async function fetchRecipeDetails(
  item: Artwork,
): Promise<ReferenceRecipe[]> {
  return (await fetchRecipeData(item)).recipes;
}
