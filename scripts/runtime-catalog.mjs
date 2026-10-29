import { createHash } from "node:crypto";
import { createSearchTerms } from "./search-index.mjs";

export function nutritionSummary(nutrition) {
  const summary = Object.fromEntries(
    [
      "status",
      "basis",
      "serving_g",
      "scope",
      "per_100g",
      "source",
      "profile_id",
      "review_status",
      "method",
      "estimation_level",
      "is_estimate",
      "id",
      "recipe_id",
    ]
      .filter((key) => key in nutrition)
      .map((key) => [key, nutrition[key]]),
  );
  // 标准配方的完整用量和品牌限制随正文按需加载，避免重复长文本撑大首页目录。
  if (
    nutrition.profile_id?.startsWith("family-") ||
    nutrition.id?.startsWith("family-")
  )
    summary.scope =
      nutrition.estimation_level === "food_group_proxy"
        ? "代理估算，见详情"
        : "见详情";
  return summary;
}

// 完整目录仍是历史证据；浏览索引只派生出页面需要的数据，不改写归档。
export function createRuntimeCatalog(manifest) {
  const details = [];
  const artworks = manifest.artworks.map(({ generation, ...artwork }) => {
    const references = artwork.reference_recipes;
    const { nutrition, nutrition_profiles, ...fields } = artwork;
    const item = {
      ...fields,
      ...(nutrition ? { nutrition: nutritionSummary(nutrition) } : {}),
      ...(nutrition_profiles
        ? {
            nutrition_profiles: nutrition_profiles
              .filter((profile) => profile.id !== nutrition?.profile_id)
              .map(nutritionSummary),
          }
        : {}),
      search_terms: createSearchTerms(artwork),
      difficulty: [
        ...new Set(
          references.flatMap((reference) => {
            const stars = reference.details?.difficulty;
            return typeof stars === "string" && /^★{1,5}$/.test(stars)
              ? [stars.length]
              : [];
          }),
        ),
      ].sort(),
      reference_recipes: references.map(
        ({ details, ...reference }) => reference,
      ),
    };
    if (references.some((reference) => reference.details)) {
      const text =
        JSON.stringify({
          schema_version: 1,
          key: artwork.key,
          reference_recipes: references,
          ...(nutrition ? { nutrition } : {}),
          ...(nutrition_profiles ? { nutrition_profiles } : {}),
        }) + "\n";
      const sha256 = createHash("sha256").update(text).digest("hex");
      const descriptor = {
        path: `assets/recipe-details/${artwork.key}.${sha256.slice(0, 16)}.json`,
        bytes: Buffer.byteLength(text),
        sha256,
      };
      item.recipe_details = descriptor;
      details.push({ ...descriptor, text });
    }
    return item;
  });
  return { index: { ...manifest, artworks }, details };
}
