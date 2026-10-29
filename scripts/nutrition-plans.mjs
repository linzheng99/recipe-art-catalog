import path from "node:path";
import { pathToFileURL } from "node:url";
import { atomicJSON, nutritionRoot, readJSON } from "./nutrition-usda.mjs";
import { resolveIngredient } from "./nutrition-ingredients.mjs";

export async function applyNutritionPlans({
  root = nutritionRoot,
  batch,
} = {}) {
  if (batch !== undefined && !/^batch-\d{3}$/.test(batch))
    throw new Error("无效批次");
  const load = (file) => readJSON(path.join(root, file));
  const [source, artwork, document, assessment, plans, library] =
    await Promise.all(
      [
        "catalog/howtocook.json",
        "catalog/illustrations.json",
        "catalog/nutrition/profiles.json",
        "catalog/nutrition/assessments.json",
        "catalog/nutrition/plans/standard-families.json",
        "catalog/nutrition/ingredients.json",
      ].map(load),
    );
  const definitions = new Map(
    library.ingredients.map((item) => [item.key, item]),
  );
  const allowed = batch
    ? new Set(
        (await load("catalog/nutrition/worklist.json")).recipes
          .filter((row) => row.batch === batch)
          .map((row) => row.recipe_id),
      )
    : null;
  const now = new Date().toISOString();
  const planIDs = new Set();
  for (const plan of plans.recipes) {
    if (
      planIDs.has(plan.recipe_id) ||
      ![
        "direct",
        "cold_mix",
        "covered_steaming",
        "stir_fry",
        "braise",
        "simmer",
        "bake",
        "microwave",
        "pan_fry",
        "deep_fry",
      ].includes(plan.process) ||
      !Array.isArray(plan.ingredients) ||
      !plan.ingredients.length ||
      plan.ingredients.some(
        (item) =>
          !definitions.has(item.key) ||
          !Number.isFinite(item.grams) ||
          item.grams <= 0,
      ) ||
      (plan.process !== "direct" &&
        (!Number.isFinite(plan.final_g) || plan.final_g <= 0)) ||
      (plan.process === "cold_mix" &&
        Math.abs(
          plan.ingredients.reduce((sum, item) => sum + item.grams, 0) -
            plan.final_g,
        ) > 1e-6)
    )
      throw new Error("标准配方重复、食材映射不存在或净重量无效");
    planIDs.add(plan.recipe_id);
  }
  let added = 0;
  for (const plan of plans.recipes) {
    if (allowed && !allowed.has(plan.recipe_id)) continue;
    const recipe = source.recipes.find((item) => item.id === plan.recipe_id);
    if (!recipe || recipe.blob_sha !== plan.recipe_blob_sha)
      throw new Error(`配方版本不符: ${plan.name}`);
    const version = plan.version ?? "1";
    const id = `family-${recipe.id.replace("howtocook-", "")}-v${version}`;
    if (document.profiles.some((profile) => profile.id === id)) continue;
    const selected = plan.ingredients.map((portion) => ({
      ...definitions.get(portion.key),
      ...portion,
    }));
    const unresolved = selected
      .filter((item) => item.mapping_review?.status !== "approved")
      .map((item) => item.name ?? item.key);
    const evidence = [
      {
        url: recipe.source_url,
        blob_sha: recipe.blob_sha,
        note: "固定原文作为独立家庭标准配方的参考；项目设定净可食克数、默认分支及成品重量，不声称原文实测。",
      },
    ];
    const entry = {
      recipe_id: recipe.id,
      recipe_blob_sha: recipe.blob_sha,
      status: unresolved.length ? "missing_evidence" : "candidate_pending",
      candidate_fdc_ids: [],
      reasons: unresolved.length
        ? [`标准配方待核验的食材来源：${unresolved.join("、")}；未编造营养值。`]
        : ["已有家庭标准方案，等待源资料及计算规则校验。"],
      evaluated_at: now,
      evidence,
    };
    if (plan.review.status !== "approved" || unresolved.length) {
      if (!assessment.recipes.some((item) => item.recipe_id === recipe.id))
        assessment.recipes.push(entry);
      continue;
    }
    const ingredients = await Promise.all(
      selected.map(async (item) => ({
        name: item.name,
        food: await resolveIngredient(item, root),
        source_state: item.state,
        quantity: {
          value: item.grams,
          unit: "g",
          edible: true,
          state: item.state,
          evidence: "项目明确的家庭标准净可食克数，不从个数或ml静默换算。",
          ...(plan.process === "deep_fry"
            ? {
                role:
                  item.key === "oil"
                    ? "retained_frying_oil"
                    : "retained_recipe_component",
              }
            : {}),
        },
        mapping_note: item.mapping_review.note,
      })),
    );
    const proxies = (plan.food_proxies ?? []).map((proxy) => {
      const index = selected.findIndex(
        (item) => item.key === proxy.ingredient_key,
      );
      if (index < 0 || !proxy.target || !proxy.reason)
        throw new Error(`食物代理须关联实际计算的食材并注明原因: ${plan.name}`);
      return {
        target: proxy.target,
        reference_name: ingredients[index].name,
        food: ingredients[index].food,
        reason: proxy.reason,
      };
    });
    const branded = selected.filter((item) => item.data_type === "Branded");
    const brandScope = branded
      .map(
        (item) =>
          `${item.name}=${item.brand_name || item.brand_owner} GTIN ${item.gtin_upc}`,
      )
      .join("；");
    const oilKeys = ["oil", "butter", "lard", "sesame_oil", "ghee"],
      sauceKeys = ["soy", "oyster", "ketchup", "tahini", "jam"];
    const portions = selected
      .map((item) => `${item.name}${item.grams}g`)
      .join("、");
    const direct = plan.process === "direct",
      cold = plan.process === "cold_mix";
    if (direct && selected.some((item) => item.provider))
      throw new Error("当前外部成分表只支持限定配方估算，不能标成USDA直接参考");
    const fried = plan.process === "deep_fry";
    const retainedOil = plan.ingredients
      .filter((item) => item.key === "oil")
      .reduce((sum, item) => sum + item.grams, 0);
    if (fried && (!retainedOil || plan.assumed_retained_oil_g !== retainedOil))
      throw new Error(
        `油炸方案须单独注明成品吸油量并与食用油输入一致: ${plan.name}`,
      );
    const finalWeight = direct
      ? undefined
      : {
          grams: plan.final_g,
          method: cold
            ? "cold_mix_mass_balance"
            : "household_recipe_assumption",
          basis: "standard_recipe_assumption",
          ...(cold ? {} : { is_measured: false, servings: { min: 2, max: 3 } }),
          evidence: cold
            ? "所列成分称重后无加热、无弃料，全部可食克数之和。"
            : `项目按2–3人家庭份明确设定成品${plan.final_g}g，非实测或USDA出成率；原料与成品重分别保存。`,
        };
    const sources = ingredients.map((item) => ({
      url:
        selected[ingredients.indexOf(item)].source_url ??
        `https://fdc.nal.usda.gov/food-details/${item.food.fdc_id}/nutrients`,
      note: `${item.name}：${item.food.description}；已核对数据类型、生熟、可食部分及原始摘要。${item.mapping_note}`,
    }));
    const match = {
      ...(proxies.length
        ? { identity_precision: "food_group_proxy", food_proxies: proxies }
        : {}),
      food_identity: recipe.id,
      state: direct ? selected[0].state : "ready_to_eat",
      cooking_method: plan.process,
      edible_part:
        "explicit_net_edible_ingredients_without_bones_shells_or_discarded_parts",
      oil_added: selected.some((item) => oilKeys.includes(item.key)),
      sugar_added: selected.some(
        (item) => item.key === "sugar" || item.key === "honey",
      ),
      sauce_added: selected.some((item) => sauceKeys.includes(item.key)),
      brand: brandScope || null,
      variant: id,
      standard_ingredients: plan.ingredients,
      excludes: [
        "不同主料、品种、品牌、用量、含水量或额外配料",
        "带骨带壳毛重、丢弃汤汁或锅中残油的实际摄入计算",
        "将家庭份成品重量假设当作实测或USDA出成率",
      ],
    };
    const profile = {
      id,
      version,
      recipe_id: recipe.id,
      recipe_blob_sha: recipe.blob_sha,
      method: direct
        ? "usda_direct"
        : selected.some((item) => item.provider)
          ? "recipe_estimate"
          : "usda_recipe_estimate",
      ...(proxies.length ? { estimation_level: "food_group_proxy" } : {}),
      default_for_artwork:
        !branded.length &&
        plan.default_for_artwork !== false &&
        artwork.artworks.find((a) => a.recipe_ids.includes(recipe.id))
          .recipe_ids.length === 1,
      scope: direct
        ? `${plan.note}。USDA通用食物每100g参考，非原菜谱实测。`
        : `${proxies.length ? "同类食物代理粗估；" : ""}2–3人家庭标准配方估算：${portions}；整份约${plan.final_g}g。${plan.note}。${brandScope ? `限定品牌：${brandScope}。` : ""}净量及成品重为明确标准假设，非实测；未做烹饪损失校正，所有列入的油糖酱均计入。`,
      match,
      assumptions: [
        `配方固定为：${portions}。克数是项目标准，不是原文ml/个数换算。`,
        plan.note,
        "仅包含列出的默认配料，省略或替换原文配料的情况在标准说明中列出；不自动代表所有同名菜谱。",
        direct
          ? "仅使用范围相符的USDA通用食物每100g参考值。"
          : cold
            ? "全部成分称重后不再加热或丢弃，全部汁液食用。"
            : "成品重量按家庭份情景独立设定；宏量营养暂按完整保留近似，未使用或伪造烹饪保留率。",
        "营养匹配独立于插画，使用方必须确认此标准配方及其品种、状态和配料。",
      ],
      uncertainty: [
        ...proxies.map(
          (proxy) =>
            `${proxy.target}采用${proxy.reference_name}代理：${proxy.reason}。这不是原食材或品牌的实测数据，实际差异可能很大。`,
        ),
        "食材品种、品牌、含水量和实际用量可能与引用的食物成分资料不同。",
        ...(direct
          ? []
          : [
              "家庭成品重量未实测；热加工蒸发、凝结、碗壁残留和营养损失未校正，实际重量变化须重算。",
            ]),
        ...(fried
          ? [
              `炸后食用的油${retainedOil}g与裹粉克数为家庭情景估算，非称量值或USDA吸油率，实际差异可能很大。`,
            ]
          : []),
        ...selected
          .filter((item) => /代理|近似|差异/.test(item.mapping_review.note))
          .map((item) => item.mapping_review.note),
      ],
      ...(direct
        ? { food: ingredients[0].food }
        : {
            recipe_basis: "standardized_assumptions",
            estimate_confidence: "low",
            ingredients,
            final_weight: finalWeight,
            process: cold
              ? {
                  retention_correction: "not_applied",
                  no_heating_after_weighing: true,
                  all_edible_material_retained: true,
                }
              : {
                  method: plan.process,
                  retention_correction: "not_applied",
                  macronutrient_retention: "assumed_full",
                  no_nutrient_bearing_liquid_discarded: true,
                  all_added_fat_retained: true,
                  ...(fried
                    ? {
                        oil_is_retained_portion: true,
                        assumed_retained_oil_g: retainedOil,
                        breading_is_retained_portion: true,
                      }
                    : {}),
                },
          }),
      review: {
        status: "approved",
        reviewer: plan.review.reviewer,
        reviewed_at: now,
        checks: {
          recipe_version: recipe.blob_sha,
          food_identity: ingredients
            .map((item) => item.food.description)
            .join("; "),
          state_and_cooking: `逐项按${selected.map((i) => i.state).join("/")}输入；成品${plan.process}。未把生料每100g当作成品值。`,
          edible_part: "所有g均为明确可食净量，排除骨、壳及清理弃料。",
          additions:
            "逐项核对油、糖、酱料；具体克数见standard_ingredients及ingredients。",
          brand: brandScope || "通用食材代理；不是任意品牌标签值。",
          standard_variant: plan.note,
          ...(proxies.length
            ? {
                proxy_policy:
                  "维护者授权使用同类通用食物估算；仅核验代理的真实来源、用量、计算和披露，不声称原食材身份匹配或准确测定。",
              }
            : {}),
        },
        evidence: [
          ...evidence,
          ...sources,
          ...selected.flatMap((item) => item.mapping_review.evidence ?? []),
        ],
      },
    };
    document.profiles.push(profile);
    const previous = assessment.recipes.find(
      (item) => item.recipe_id === recipe.id,
    );
    Object.assign(entry, {
      status: "evaluated",
      candidate_fdc_ids: [
        ...new Set(
          ingredients
            .map((item) => item.food.fdc_id)
            .filter(Number.isSafeInteger),
        ),
      ],
      source_food_ids: ingredients
        .filter((item) => item.food.provider)
        .map((item) => ({
          provider: item.food.provider,
          food_id: item.food.food_id,
        })),
      reasons: [
        direct
          ? profile.scope
          : `已生成明确的2–3人标准配方估算，整份${plan.final_g}g。`,
        plan.note,
      ],
    });
    if (previous) {
      const history = previous.history ?? [];
      if (previous.status !== "evaluated")
        history.push({
          status: previous.status,
          reasons: previous.reasons,
          evaluated_at: previous.evaluated_at,
          change_reason:
            "采用明确的家庭份估算假设并复核食材来源，保留先前缺项记录。",
        });
      for (const key of Object.keys(previous)) delete previous[key];
      Object.assign(previous, entry, { history });
    } else assessment.recipes.push(entry);
    added++;
  }
  await atomicJSON(
    path.join(root, "catalog/nutrition/profiles.json"),
    document,
  );
  await atomicJSON(
    path.join(root, "catalog/nutrition/assessments.json"),
    assessment,
  );
  return { added, total_profiles: document.profiles.length };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const at = process.argv.indexOf("--batch");
  if (at >= 0 && !process.argv[at + 1]) throw new Error("--batch需要批次值");
  console.log(
    JSON.stringify(
      await applyNutritionPlans({
        batch: at < 0 ? undefined : process.argv[at + 1],
      }),
    ),
  );
}
