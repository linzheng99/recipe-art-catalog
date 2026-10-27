export const categories: Record<string, string> = {
  meat_dish: "家常荤菜",
  vegetable_dish: "清爽素菜",
  aquatic: "水产海鲜",
  breakfast: "早餐",
  staple: "主食",
  dessert: "甜点",
  drink: "饮品",
  condiment: "调味",
  soup: "汤羹",
};

export interface Variant {
  path: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export interface RecipeContent {
  introduction: string;
  difficulty: string | null;
  sections: { heading: string; markdown: string }[];
}

export interface ReferenceRecipe {
  id: string;
  name: string;
  url: string;
  details?: RecipeContent | null;
}

export interface Artwork {
  key: string;
  name: string;
  aliases: string[];
  category: string;
  generation?: {
    prompt: string;
    correction: { prompt: string; reason: string } | null;
    tool: string;
    style_reference: string;
    source_file: string;
  } | null;
  variants: Record<"256" | "512", Variant>;
  reference_recipes: ReferenceRecipe[];
  recipe_details?: { path: string; bytes: number; sha256: string };
  nutrition: {
    status: "unknown" | "reference";
    basis: "per_100g" | null;
    scope: string | null;
    per_100g: {
      energy_kcal: number | null;
      protein_g: number | null;
      carbohydrate_g: number | null;
      fat_g: number | null;
    };
    source: { url: string; version: string } | null;
  };
}

export interface Catalog {
  schema_version: 1;
  version: string;
  coverage: {
    artworks: number;
    recipes: number;
    pending: number;
    excluded_templates: number;
  };
  artworks: Artwork[];
}

export const normalize = (text: string) =>
  text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

export function filterArtworks(
  artworks: Artwork[],
  query: string,
  category: string,
) {
  const term = normalize(query);
  return artworks.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      [item.name, ...item.aliases].some((name) =>
        normalize(name).includes(term),
      ),
  );
}

export function getManifestURL() {
  return new URL("manifest.json", window.location.href);
}

export function getCatalogURL() {
  return new URL("manifest-lite.json", window.location.href);
}

export function imageURL(
  item: Artwork,
  size: "256" | "512",
  manifestURL = getManifestURL(),
) {
  const variant = item.variants?.[size];
  if (
    !variant ||
    !/^assets\/food-artwork\/[a-z0-9-]+\.[a-f0-9]{16}\.(256|512)\.webp$/.test(
      variant.path,
    )
  ) {
    throw new Error("Invalid image path");
  }
  return new URL(variant.path, manifestURL).href;
}

export function safeExternalURL(value: string | undefined, hostname?: string) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && (!hostname || url.hostname === hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function parseReferenceRecipes(value: unknown): ReferenceRecipe[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (recipe) =>
        record(recipe) &&
        typeof recipe.id === "string" &&
        typeof recipe.name === "string" &&
        typeof recipe.url === "string",
    )
  )
    throw new Error("Invalid source");
  for (const recipe of value) {
    const details = recipe.details;
    if (
      details !== undefined &&
      details !== null &&
      (!record(details) ||
        typeof details.introduction !== "string" ||
        (details.difficulty !== null &&
          typeof details.difficulty !== "string") ||
        !Array.isArray(details.sections) ||
        !details.sections.every(
          (section) =>
            record(section) &&
            typeof section.heading === "string" &&
            typeof section.markdown === "string",
        ))
    )
      throw new Error("Invalid recipe content");
  }
  return value as ReferenceRecipe[];
}

export function parseRecipeDescriptor(
  value: unknown,
  key: string,
): NonNullable<Artwork["recipe_details"]> {
  if (
    !record(value) ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    value.path !==
      `assets/recipe-details/${key}.${value.sha256.slice(0, 16)}.json` ||
    !Number.isSafeInteger(value.bytes) ||
    (value.bytes as number) <= 0
  )
    throw new Error("Invalid recipe descriptor");
  return value as NonNullable<Artwork["recipe_details"]>;
}

export function parseCatalog(value: unknown): Catalog {
  if (
    !record(value) ||
    value.schema_version !== 1 ||
    typeof value.version !== "string" ||
    !Array.isArray(value.artworks) ||
    !record(value.coverage)
  ) {
    throw new Error("Unsupported catalog");
  }
  for (const field of [
    "artworks",
    "recipes",
    "pending",
    "excluded_templates",
  ]) {
    const count = value.coverage[field];
    if (!Number.isSafeInteger(count) || (count as number) < 0)
      throw new Error("Invalid coverage");
  }
  const keys = new Set<string>();
  // 原始 JSON 是不可信的运行时数据；完整校验后再交给组件，避免详情点击时才崩溃。
  for (const item of value.artworks) {
    if (
      !record(item) ||
      typeof item.key !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.key) ||
      keys.has(item.key) ||
      typeof item.name !== "string" ||
      !Array.isArray(item.aliases) ||
      !item.aliases.every((name) => typeof name === "string") ||
      typeof item.category !== "string" ||
      !record(item.variants) ||
      !Array.isArray(item.reference_recipes)
    ) {
      throw new Error("Invalid artwork");
    }
    keys.add(item.key);
    const generation = item.generation;
    // 兼容尚未包含新增字段的 schema=1 目录；有记录时须保证可显示和复制。
    if (generation !== undefined && generation !== null) {
      if (
        !record(generation) ||
        typeof generation.prompt !== "string" ||
        !generation.prompt.trim() ||
        typeof generation.tool !== "string" ||
        typeof generation.style_reference !== "string" ||
        typeof generation.source_file !== "string" ||
        (generation.correction !== null &&
          (!record(generation.correction) ||
            typeof generation.correction.prompt !== "string" ||
            !generation.correction.prompt.trim() ||
            typeof generation.correction.reason !== "string"))
      )
        throw new Error("Invalid generation prompt");
    }
    for (const size of ["256", "512"] as const) {
      const variant = item.variants[size];
      if (
        !record(variant) ||
        typeof variant.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(variant.sha256) ||
        variant.path !==
          `assets/food-artwork/${item.key}.${variant.sha256.slice(0, 16)}.${size}.webp` ||
        variant.width !== Number(size) ||
        variant.height !== Number(size) ||
        !Number.isSafeInteger(variant.bytes) ||
        (variant.bytes as number) <= 0
      )
        throw new Error("Invalid variant");
    }
    parseReferenceRecipes(item.reference_recipes);
    if (item.recipe_details !== undefined)
      parseRecipeDescriptor(item.recipe_details, item.key);
    const nutrition = item.nutrition;
    if (
      !record(nutrition) ||
      !["unknown", "reference"].includes(String(nutrition.status)) ||
      !record(nutrition.per_100g) ||
      (nutrition.basis !== null && nutrition.basis !== "per_100g") ||
      (nutrition.scope !== null && typeof nutrition.scope !== "string")
    )
      throw new Error("Invalid nutrition");
    for (const field of [
      "energy_kcal",
      "protein_g",
      "carbohydrate_g",
      "fat_g",
    ]) {
      const number = nutrition.per_100g[field];
      if (
        number !== null &&
        (typeof number !== "number" ||
          !Number.isFinite(number) ||
          number < 0 ||
          nutrition.status !== "reference" ||
          nutrition.basis !== "per_100g" ||
          !nutrition.scope ||
          !record(nutrition.source) ||
          !safeExternalURL(String(nutrition.source.url)) ||
          typeof nutrition.source.version !== "string")
      )
        throw new Error("Invalid nutrition reference");
    }
    if (
      nutrition.source !== null &&
      (!record(nutrition.source) ||
        typeof nutrition.source.url !== "string" ||
        typeof nutrition.source.version !== "string")
    )
      throw new Error("Invalid nutrition source");
  }
  if (value.coverage.artworks !== value.artworks.length)
    throw new Error("Coverage mismatch");
  return value as unknown as Catalog;
}
