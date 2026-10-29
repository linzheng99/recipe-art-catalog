export interface NutrientValues {
  energy_kcal: number | null;
  protein_g: number | null;
  carbohydrate_g: number | null;
  fat_g: number | null;
}
export interface NutritionProfile {
  id: string;
  supersedes?: string;
  version?: string;
  recipe_id: string;
  recipe_blob_sha: string;
  status: "reference";
  review_status: "approved" | "pending";
  basis: "per_100g";
  method: "usda_direct" | "usda_recipe_estimate" | "recipe_estimate";
  recipe_basis?: "source_recipe" | "standardized_assumptions";
  data_version: string;
  is_estimate: boolean;
  estimation_level?: "food_group_proxy";
  scope: string;
  match: Record<string, unknown>;
  per_100g: NutrientValues;
  final_weight?: {
    grams: number;
    is_measured?: boolean;
    [key: string]: unknown;
  };
  source: {
    url: string;
    version: string;
    fdc_ids: number[];
    providers?: string[];
    food_ids?: { provider: "mext" | "krda"; id: string }[];
    [key: string]: unknown;
  };
  details: { path: string; bytes: number; sha256: string };
}
export interface NutritionRecipe {
  nutrition_profiles?: NutritionProfile[];
  recipe_id: string;
  name: string;
  status: string;
  review_status:
    "reference_available" | "reviewed_without_reference" | "not_reviewed";
  blocker_code?: string | null;
  next_action?: string | null;
  reasons?: string[];
  evaluated_at?: string | null;
  profile_ids: string[];
  nutrition: NutritionProfile | { status: "unknown"; per_100g: NutrientValues };
}
export interface NutritionIndex {
  schema_version: 1;
  version: string;
  reference_quality?: { food_group_proxy: number; other_available: number };
  profiles: NutritionProfile[];
  recipes: NutritionRecipe[];
}
export interface Fallback {
  status: "fallback";
  reason: string;
  fallback: "USDA";
}
export interface LoadedNutrition {
  status: "available";
  manifestURL: string;
  version: string;
  index: NutritionIndex;
}
export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  format?: "lite" | "full";
}
export function loadNutritionIndex(
  manifestURL: string | URL,
  options?: FetchOptions,
): Promise<LoadedNutrition | Fallback>;
export function findNutritionProfiles(
  loaded: LoadedNutrition | Fallback,
  query?: { recipeId?: string; recipeBlobSha?: string },
):
  | Fallback
  | {
      status: "needs_match_confirmation";
      recipe: NutritionRecipe;
      candidates: NutritionProfile[];
      version: string;
    };
export function calculateNutrition(
  profile: NutritionProfile,
  edibleGrams: number,
  options?: {
    confirmedProfileId?: string;
    acceptStandardRecipe?: boolean;
    acceptAssumedWeight?: boolean;
  },
):
  | Fallback
  | {
      status: "available" | "partial";
      profile_id: string;
      recipe_id: string;
      data_version: string;
      method: NutritionProfile["method"];
      is_estimate: boolean;
      estimation_level?: "food_group_proxy";
      scope: string;
      source: NutritionProfile["source"];
      per_100g: NutrientValues;
      portion: { edible_g: number; nutrients: NutrientValues };
      missing_nutrients: (keyof NutrientValues)[];
      fallback: "USDA" | null;
    };
export function loadNutritionDetails(
  loaded: LoadedNutrition | Fallback,
  profile: NutritionProfile,
  options?: FetchOptions,
): Promise<Fallback | { status: "available"; detail: Record<string, unknown> }>;
