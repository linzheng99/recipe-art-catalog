const fields = ["energy_kcal", "protein_g", "carbohydrate_g", "fat_g"];
const fallback = (reason) => ({ status: "fallback", reason, fallback: "USDA" });

async function getJSON(url, fetchImpl, timeoutMs) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// 仅读取公开JSON，无USDA凭据；未部署、旧目录和请求失败都有显式回退状态。
export async function loadNutritionIndex(
  manifestURL,
  { fetchImpl = fetch, timeoutMs = 15000 } = {},
) {
  try {
    const manifest = await getJSON(manifestURL, fetchImpl, timeoutMs);
    const descriptor = manifest.nutrition_catalog;
    if (!descriptor) return fallback("nutrition_not_published");
    if (
      manifest.schema_version !== 1 ||
      descriptor.path !== "nutrition/index.json"
    )
      return fallback("unsupported_catalog");
    const index = await getJSON(
      new URL(descriptor.path, manifestURL),
      fetchImpl,
      timeoutMs,
    );
    if (
      index.schema_version !== 1 ||
      index.version !== descriptor.version ||
      !Array.isArray(index.profiles) ||
      !Array.isArray(index.recipes) ||
      !index.recipes.every(
        (row) =>
          row &&
          typeof row.recipe_id === "string" &&
          Array.isArray(row.profile_ids) &&
          row.profile_ids.every((id) => typeof id === "string"),
      ) ||
      !index.profiles.every(
        (profile) =>
          profile &&
          typeof profile.id === "string" &&
          typeof profile.recipe_id === "string",
      ) ||
      new Set(index.recipes.map((row) => row.recipe_id)).size !==
        index.recipes.length ||
      new Set(index.profiles.map((profile) => profile.id)).size !==
        index.profiles.length
    )
      return fallback("invalid_or_mixed_version");
    return {
      status: "available",
      manifestURL: String(manifestURL),
      version: index.version,
      index,
    };
  } catch {
    return fallback("catalog_request_failed");
  }
}

export function findNutritionProfiles(
  loaded,
  { recipeId, recipeBlobSha } = {},
) {
  if (loaded.status !== "available")
    return fallback(loaded.reason ?? "catalog_unavailable");
  if (!recipeId) return fallback("recipe_id_required");
  const row = loaded.index.recipes.find((item) => item.recipe_id === recipeId);
  if (!row) return fallback("recipe_not_found");
  const candidates = loaded.index.profiles.filter(
    (profile) =>
      profile.recipe_id === recipeId &&
      row.profile_ids.includes(profile.id) &&
      profile.review_status === "approved" &&
      profile.status === "reference" &&
      (!recipeBlobSha || recipeBlobSha === profile.recipe_blob_sha),
  );
  if (!candidates.length)
    return fallback(recipeBlobSha ? "no_matching_recipe_version" : row.status);
  // recipe_id只定位方案；使用方仍需核对品种、生熟、油糖酱和标准配方假设。
  return {
    status: "needs_match_confirmation",
    recipe: row,
    candidates,
    version: loaded.version,
  };
}

export function calculateNutrition(
  profile,
  edibleGrams,
  {
    confirmedProfileId,
    acceptStandardRecipe = false,
    acceptAssumedWeight = false,
  } = {},
) {
  if (!Number.isFinite(edibleGrams) || edibleGrams <= 0)
    throw new Error("可食克数必须是有限正数");
  if (!profile || profile.id !== confirmedProfileId)
    return fallback("independent_match_not_confirmed");
  const fdcIDs = profile.source?.fdc_ids;
  const externalIDs = profile.source?.food_ids;
  const validFDC =
    Array.isArray(fdcIDs) &&
    fdcIDs.every((id) => Number.isSafeInteger(id) && id > 0);
  const validExternal =
    profile.method === "recipe_estimate" &&
    Array.isArray(externalIDs) &&
    externalIDs.length > 0 &&
    Array.isArray(profile.source?.providers) &&
    externalIDs.every(
      (food) =>
        ((food.provider === "mext" && /^\d{5}$/.test(food.id)) ||
          (food.provider === "krda" &&
            /^[A-Z][a-zA-Z0-9]{11}$/.test(food.id))) &&
        profile.source.providers?.includes(food.provider),
    ) &&
    profile.source.providers.some((provider) =>
      ["mext", "krda"].includes(provider),
    );
  if (
    profile.status !== "reference" ||
    profile.review_status !== "approved" ||
    profile.basis !== "per_100g" ||
    !profile.source?.version ||
    !/^https:\/\//.test(profile.source?.url) ||
    !["usda_direct", "usda_recipe_estimate", "recipe_estimate"].includes(
      profile.method,
    ) ||
    !validFDC ||
    (profile.method === "recipe_estimate" ? !validExternal : !fdcIDs.length)
  )
    return fallback("invalid_reference");
  if (
    profile.recipe_basis === "standardized_assumptions" &&
    !acceptStandardRecipe
  )
    return fallback("standard_recipe_not_accepted");
  if (profile.final_weight?.is_measured === false && !acceptAssumedWeight)
    return fallback("assumed_finished_weight_not_accepted");
  if (
    fields.some(
      (key) =>
        profile.per_100g?.[key] !== null &&
        (!Number.isFinite(profile.per_100g?.[key]) ||
          profile.per_100g[key] < 0),
    )
  )
    return fallback("invalid_nutrients");
  const missing = fields.filter((key) => profile.per_100g[key] === null);
  if (missing.length === fields.length) return fallback("nutrients_unknown");
  const nutrients = Object.fromEntries(
    fields.map((key) => [
      key,
      profile.per_100g[key] === null
        ? null
        : (profile.per_100g[key] * edibleGrams) / 100,
    ]),
  );
  if (
    Object.values(nutrients).some(
      (value) => value !== null && !Number.isFinite(value),
    )
  )
    return fallback("calculation_overflow");
  return {
    status: missing.length ? "partial" : "available",
    profile_id: profile.id,
    recipe_id: profile.recipe_id,
    data_version: profile.data_version,
    method: profile.method,
    is_estimate: profile.is_estimate,
    ...(profile.estimation_level
      ? { estimation_level: profile.estimation_level }
      : {}),
    scope: profile.scope,
    source: profile.source,
    per_100g: profile.per_100g,
    portion: { edible_g: edibleGrams, nutrients },
    missing_nutrients: missing,
    fallback: missing.length ? "USDA" : null,
  };
}

export async function loadNutritionDetails(
  loaded,
  profile,
  { fetchImpl = fetch, timeoutMs = 15000 } = {},
) {
  try {
    const descriptor = profile.details;
    if (
      loaded.status !== "available" ||
      !loaded.index.profiles.some(
        (item) =>
          item.id === profile.id && item.details?.sha256 === descriptor?.sha256,
      ) ||
      !/^assets\/nutrition\/[a-z0-9-]+\.[a-f0-9]{16}\.json$/.test(
        descriptor?.path,
      )
    )
      return fallback("invalid_detail_descriptor");
    // 详情路径以manifest所在站点目录解析，不以nutrition/index.json目录解析。
    const response = await fetchImpl(
      new URL(descriptor.path, loaded.manifestURL),
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) throw new Error("details unavailable");
    const bytes = await response.arrayBuffer();
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    if (bytes.byteLength !== descriptor.bytes || digest !== descriptor.sha256)
      return fallback("detail_integrity_failed");
    const detail = JSON.parse(new TextDecoder().decode(bytes));
    if (
      detail.schema_version !== 1 ||
      detail.id !== profile.id ||
      detail.recipe_id !== profile.recipe_id ||
      detail.data_version !== profile.data_version
    )
      return fallback("detail_version_mismatch");
    return { status: "available", detail };
  } catch {
    return fallback("detail_request_failed");
  }
}
