import {
  getCatalogURL,
  parseRecipeDescriptor,
  parseReferenceRecipes,
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

export async function fetchRecipeDetails(
  item: Artwork,
): Promise<ReferenceRecipe[]> {
  if (!item.recipe_details) return item.reference_recipes;
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
  return parseRecipeDetails(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)),
    item,
  );
}
