import { sha256 } from "./nutrition-usda.mjs";
import { readCompositionSnapshot } from "./nutrition-composition.mjs";
import { validKRDAID } from "./nutrition-krda.mjs";

export const RULES_VERSION = "nutrition-1.6.0";
export const nutrientFields = {
  energy_kcal: [1008, "kcal"],
  protein_g: [1003, "g"],
  carbohydrate_g: [1005, "g"],
  fat_g: [1004, "g"],
};
export const emptyNutrients = () =>
  Object.fromEntries(Object.keys(nutrientFields).map((key) => [key, null]));
export const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const positive = (value) => Number.isFinite(value) && value > 0;
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
export const round = (value) => {
  if (value === null) return null;
  ensure(Number.isFinite(value) && value >= 0, "营养计算溢出或出现非法数值");
  return Number(value.toFixed(6));
};
const checkNutrientMass = (values) => {
  const knownGrams = ["protein_g", "carbohydrate_g", "fat_g"].reduce(
    (sum, key) => sum + (values[key] ?? 0),
    0,
  );
  // 容许标签取整的小幅误差，但不能用过低成品重制造超过实物质量的宏量营养。
  ensure(
    knownGrams <= 105,
    "每100g已知宏量营养总克数超过质量上限，请复核来源或成品重量",
  );
};

export const foodReferenceKey = (food) => {
  if (food.provider) {
    ensure(
      (food.provider === "mext" && /^\d{5}$/.test(food.food_id)) ||
        (food.provider === "krda" && validKRDAID(food.food_id)),
      "食物来源或食品编号错误",
    );
    return `${food.provider}:${food.food_id}`;
  }
  ensure(Number.isSafeInteger(food.fdc_id) && food.fdc_id > 0, "非法FDC ID");
  return food.fdc_id;
};

export function readFoodSnapshot(snapshot, expected) {
  if (expected.provider) return readCompositionSnapshot(snapshot, expected);
  ensure(
    snapshot.schema_version === 1 &&
      snapshot.raw_sha256 === sha256(JSON.stringify(snapshot.response)),
    "USDA 原始缓存摘要不一致",
  );
  const food = snapshot.response;
  ensure(
    Number.isSafeInteger(food.fdcId) &&
      food.fdcId > 0 &&
      food.fdcId === expected.fdc_id,
    "FDC ID 与映射不一致",
  );
  ensure(
    food.description === expected.description &&
      food.dataType === expected.data_type &&
      snapshot.raw_sha256 === expected.snapshot_sha256,
    "食物描述、数据类型或来源版本变化，需重新审核",
  );
  const publicationDate = food.publicationDate ?? food.publishedDate;
  if (food.dataType === "Branded") {
    ensure(
      nonempty(expected.gtin_upc) &&
        food.gtinUpc === expected.gtin_upc &&
        nonempty(expected.brand_owner) &&
        food.brandOwner === expected.brand_owner,
      "品牌来源必须核对生产商和GTIN，不可当作通用食物",
    );
  }
  ensure(
    Array.isArray(food.foodNutrients) &&
      nonempty(publicationDate) &&
      Number.isFinite(Date.parse(snapshot.retrieved_at)),
    "USDA 来源版本或获取日期缺失",
  );
  const nutrients = food.foodNutrients.map((row) =>
    row.nutrient
      ? row
      : {
          nutrient: { id: row.nutrientId, unitName: row.unitName },
          amount: row.value,
        },
  );
  const values = emptyNutrients();
  const evidence = {};
  for (const [key, [id, unit]] of Object.entries(nutrientFields)) {
    // 优先采用 USDA 原始 kcal，不用4/4/9覆盖；仅在1008不存在时采用明确的 Atwater kcal。
    const ids = key === "energy_kcal" ? [id, 2048, 2047] : [id];
    for (const nutrientId of ids) {
      const rows = nutrients.filter(
        (row) =>
          row.nutrient?.id === nutrientId &&
          row.amount !== undefined &&
          row.amount !== null,
      );
      if (!rows.length) continue;
      ensure(
        rows.every(
          (row) =>
            String(row.nutrient.unitName).toLowerCase() === unit &&
            Number.isFinite(row.amount) &&
            row.amount >= 0 &&
            row.amount <= (unit === "g" ? 100 : 1000),
        ),
        `USDA ${key} 数值或单位错误`,
      );
      ensure(
        rows.every((row) => row.amount === rows[0].amount),
        `USDA ${key} 同营养素出现冲突`,
      );
      values[key] = rows[0].amount;
      evidence[key] = {
        nutrient_id: nutrientId,
        unit,
        amount_per_100g: rows[0].amount,
      };
      break;
    }
  }
  checkNutrientMass(values);
  return {
    per_100g: values,
    nutrient_evidence: evidence,
    source: {
      name: "USDA FoodData Central",
      fdc_id: food.fdcId,
      description: food.description,
      data_type: food.dataType,
      ...(food.dataType === "Branded"
        ? {
            brand_owner: food.brandOwner,
            brand_name: food.brandName ?? null,
            gtin_upc: food.gtinUpc,
            ingredients: food.ingredients ?? null,
          }
        : {}),
      publication_date: publicationDate,
      retrieved_at: snapshot.retrieved_at,
      url: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,
      version: `${food.dataType} / ${publicationDate} / ${snapshot.raw_sha256.slice(0, 16)}`,
      raw_sha256: snapshot.raw_sha256,
      transport: snapshot.transport,
      ...(snapshot.dataset_url
        ? {
            dataset_url: snapshot.dataset_url,
            release: snapshot.release,
            dataset_sha256: snapshot.dataset_sha256,
          }
        : {}),
      ...(snapshot.query_sha256 ? { query_sha256: snapshot.query_sha256 } : {}),
    },
  };
}

export function edibleGrams(quantity) {
  ensure(
    quantity?.edible === true &&
      nonempty(quantity.evidence) &&
      ["raw", "cooked", "ready_to_eat"].includes(quantity.state),
    "食材缺少可食部分、生熟或重量依据",
  );
  ensure(positive(quantity.value), "食材重量必须为正数");
  if (quantity.unit === "g") return quantity.value;
  ensure(quantity.unit === "ml", "仅支持g或有密度依据的ml");
  const density = quantity.density;
  ensure(
    positive(density?.g_per_ml) &&
      /^https:\/\//.test(density.source_url) &&
      nonempty(density.version) &&
      nonempty(density.conditions),
    "ml转g缺少密度、来源版本或适用条件",
  );
  const grams = quantity.value * density.g_per_ml;
  ensure(positive(grams), "食材克数换算溢出");
  return grams;
}

export function calculateRecipe(ingredients, finalWeight, process) {
  ensure(Array.isArray(ingredients) && ingredients.length > 0, "配方缺少食材");
  const resolved = ingredients.map((ingredient) => {
    ensure(
      ingredient.quantity.state === ingredient.source_state &&
        nonempty(ingredient.name),
      "食材生熟状态与营养基准不一致",
    );
    const grams = edibleGrams(ingredient.quantity);
    for (const key of Object.keys(nutrientFields)) {
      const value = ingredient.per_100g[key];
      ensure(
        value === null || (Number.isFinite(value) && value >= 0),
        "营养缺失须显式为null，不能为undefined或非法数字",
      );
    }
    return { ...ingredient, edible_g: grams };
  });
  const total = emptyNutrients();
  for (const key of Object.keys(nutrientFields)) {
    total[key] = resolved.some(
      (ingredient) => ingredient.per_100g[key] === null,
    )
      ? null
      : resolved.reduce(
          (sum, ingredient) =>
            sum + (ingredient.per_100g[key] * ingredient.edible_g) / 100,
          0,
        );
  }
  let grams = null;
  if (finalWeight !== null) {
    ensure(
      positive(finalWeight?.grams) && nonempty(finalWeight.evidence),
      "成品重量缺少依据",
    );
    ensure(
      [
        "measured",
        "published_yield",
        "cold_mix_mass_balance",
        "household_serving_assumption",
        "household_recipe_assumption",
      ].includes(finalWeight.method),
      "成品重量不能直接用热加工原料重量之和",
    );
    if (finalWeight.method === "cold_mix_mass_balance") {
      ensure(
        process?.no_heating_after_weighing === true &&
          process.all_edible_material_retained === true,
        "冷拌质量守恒条件不满足",
      );
      ensure(
        Math.abs(
          resolved.reduce((sum, item) => sum + item.edible_g, 0) -
            finalWeight.grams,
        ) < 1e-6,
        "冷拌成品重量与可食食材总量不一致",
      );
    } else if (
      ["household_serving_assumption", "household_recipe_assumption"].includes(
        finalWeight.method,
      )
    ) {
      // 家庭份是维护者允许的估算情景，绝不伪装成实测重量或文献出成率。
      const servings = finalWeight.servings;
      ensure(
        finalWeight.basis === "standard_recipe_assumption" &&
          Number.isSafeInteger(servings?.min) &&
          servings.min > 0 &&
          Number.isSafeInteger(servings?.max) &&
          servings.max >= servings.min &&
          finalWeight.is_measured === false,
        "家庭份重量须明确人数范围、假设基准及非实测标记",
      );
      ensure(
        (finalWeight.method === "household_serving_assumption"
          ? process?.method === "covered_steaming"
          : [
              "covered_steaming",
              "stir_fry",
              "braise",
              "simmer",
              "bake",
              "microwave",
              "pan_fry",
              "deep_fry",
            ].includes(process?.method)) &&
          process.retention_correction === "not_applied" &&
          process.macronutrient_retention === "assumed_full" &&
          process.no_nutrient_bearing_liquid_discarded === true &&
          process.all_added_fat_retained === true,
        "家庭份热加工估算须明确带盖蒸制、无弃汁及宏量营养保留假设",
      );
      if (process.method === "deep_fry") {
        ensure(
          process.oil_is_retained_portion === true &&
            Number.isFinite(process.assumed_retained_oil_g) &&
            process.assumed_retained_oil_g > 0 &&
            process.breading_is_retained_portion === true,
          "油炸估算必须记录假设的成品吸油量和实际保留裹粉，而非油锅投油量",
        );
        const oilGrams = resolved
          .filter((item) => item.quantity.role === "retained_frying_oil")
          .reduce((sum, item) => sum + item.edible_g, 0);
        ensure(
          Math.abs(oilGrams - process.assumed_retained_oil_g) < 1e-6,
          "成品吸油量与营养计算输入不一致",
        );
      }
    } else
      ensure(
        /^https:\/\//.test(finalWeight.source_url) &&
          nonempty(finalWeight.version),
        "成品实测或出成率缺少可追溯来源与版本",
      );
    grams = finalWeight.grams;
  }
  const per100g = Object.fromEntries(
    Object.entries(total).map(([key, value]) => [
      key,
      grams === null || value === null ? null : round((value / grams) * 100),
    ]),
  );
  checkNutrientMass(per100g);
  return {
    ingredients: resolved,
    total: Object.fromEntries(
      Object.entries(total).map(([key, value]) => [key, round(value)]),
    ),
    final_edible_g: grams,
    per_100g: per100g,
  };
}

export function validateProfile(profile, recipe) {
  if (
    ["household_serving_assumption", "household_recipe_assumption"].includes(
      profile.final_weight?.method,
    )
  )
    ensure(
      profile.recipe_basis === "standardized_assumptions" &&
        profile.estimate_confidence === "low",
      "家庭份成品重量只能用于低置信度的标准配方估算",
    );
  if (profile.recipe_basis !== undefined)
    ensure(
      ["source_recipe", "standardized_assumptions"].includes(
        profile.recipe_basis,
      ),
      "营养方案配方基准错误",
    );
  if (profile.recipe_basis === "standardized_assumptions")
    ensure(
      ["usda_recipe_estimate", "recipe_estimate"].includes(profile.method) &&
        profile.final_weight?.basis === "standard_recipe_assumption",
      "标准配方必须标记估算及假设的成品重量基准",
    );
  ensure(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.id) && nonempty(profile.version),
    "营养方案标识或版本错误",
  );
  ensure(
    recipe &&
      profile.recipe_id === recipe.id &&
      profile.recipe_blob_sha === recipe.blob_sha,
    "营养方案对应菜谱或配方版本已变化",
  );
  ensure(
    ["usda_direct", "usda_recipe_estimate", "recipe_estimate"].includes(
      profile.method,
    ) && ["approved", "pending", "withdrawn"].includes(profile.review?.status),
    "营养方法或审核状态错误",
  );
  if (profile.review.status === "withdrawn")
    ensure(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.review.superseded_by ?? "") &&
        profile.review.superseded_by !== profile.id &&
        nonempty(profile.review.withdrawal_reason) &&
        Number.isFinite(Date.parse(profile.review.withdrawn_at)),
      "撤回旧方案须注明替代方案、原因和日期",
    );
  ensure(
    nonempty(profile.scope) &&
      Array.isArray(profile.assumptions) &&
      profile.assumptions.length > 0 &&
      profile.assumptions.every(nonempty) &&
      Array.isArray(profile.uncertainty) &&
      profile.uncertainty.length > 0 &&
      profile.uncertainty.every(nonempty),
    "缺少适用范围、默认假设或不确定性",
  );
  ensure(
    nonempty(profile.match?.food_identity) &&
      nonempty(profile.match.state) &&
      nonempty(profile.match.cooking_method) &&
      nonempty(profile.match.edible_part) &&
      Array.isArray(profile.match.excludes) &&
      profile.match.excludes.length > 0 &&
      profile.match.excludes.every(nonempty),
    "缺少独立的营养匹配条件和排除项",
  );
  for (const key of ["oil_added", "sugar_added", "sauce_added"])
    ensure(typeof profile.match[key] === "boolean", "必须明确油糖酱料是否包含");
  ensure(
    profile.match.brand === null || nonempty(profile.match.brand),
    "品牌须显式给出或为null",
  );
  if (profile.estimation_level !== undefined) {
    ensure(
      profile.estimation_level === "food_group_proxy" &&
        profile.recipe_basis === "standardized_assumptions" &&
        profile.default_for_artwork === false &&
        profile.match.identity_precision === "food_group_proxy" &&
        Array.isArray(profile.match.food_proxies) &&
        profile.match.food_proxies.length > 0 &&
        profile.match.food_proxies.every(
          (proxy) =>
            nonempty(proxy.target) &&
            nonempty(proxy.reference_name) &&
            nonempty(proxy.reason) &&
            profile.ingredients?.some(
              (ingredient) =>
                foodReferenceKey(ingredient.food) ===
                foodReferenceKey(proxy.food),
            ),
        ),
      "同类食物代理须披露目标、真实来源和原因，不能成为插画默认或原配方实测",
    );
  }
  if (profile.review.status === "approved") {
    ensure(
      nonempty(profile.review.reviewer) &&
        Number.isFinite(Date.parse(profile.review.reviewed_at)) &&
        Array.isArray(profile.review.evidence) &&
        profile.review.evidence.length >= 2 &&
        profile.review.evidence.every(
          (item) => /^https:\/\//.test(item?.url) && nonempty(item?.note),
        ),
      "已审核方案缺少审核证据",
    );
    for (const key of [
      "food_identity",
      "state_and_cooking",
      "edible_part",
      "additions",
      "brand",
      "recipe_version",
    ])
      ensure(nonempty(profile.review.checks?.[key]), `审核证据缺少 ${key}`);
  }
}
