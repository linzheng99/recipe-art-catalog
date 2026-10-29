import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { MEXT_DATASET } from "./nutrition-composition.mjs";
import { KRDA_DATASET } from "./nutrition-krda.mjs";
import { readJSON, sha256 } from "./nutrition-usda.mjs";
import {
  RULES_VERSION,
  foodReferenceKey,
  readFoodSnapshot,
  validateProfile,
  calculateRecipe,
  emptyNutrients,
  ensure,
} from "./nutrition-model.mjs";

export async function loadNutritionCatalog(root, source, config, legacy) {
  const document = await readJSON(
    path.join(root, "catalog/nutrition/profiles.json"),
  );
  const assessments = await readJSON(
    path.join(root, "catalog/nutrition/assessments.json"),
  );
  const checkpoints = path.join(root, "sources/nutrition/checkpoints");
  const batches = await Promise.all(
    (await readdir(checkpoints))
      .filter((name) => /^batch-\d{3}\.json$/.test(name))
      .sort()
      .map((name) => readJSON(path.join(checkpoints, name))),
  );
  ensure(
    document.schema_version === 1 && assessments.schema_version === 1,
    "营养源数据schema错误",
  );
  const ids = [
    ...new Set(
      document.profiles
        .filter((profile) => profile.review.status === "approved")
        .flatMap((profile) =>
          profile.method === "usda_direct"
            ? [foodReferenceKey(profile.food)]
            : profile.ingredients.map((ingredient) =>
                foodReferenceKey(ingredient.food),
              ),
        ),
    ),
  ];
  const snapshots = new Map(
    await Promise.all(
      ids.map(async (id) => [
        id,
        await readJSON(
          typeof id === "number"
            ? path.join(root, "sources/nutrition/usda", `${id}.json`)
            : path.join(root, "sources/nutrition", ...id.split(":")) + ".json",
        ),
      ]),
    ),
  );
  for (const dataset of [MEXT_DATASET, KRDA_DATASET]) {
    if (
      !ids.some(
        (id) => typeof id === "string" && id.startsWith(`${dataset.provider}:`),
      )
    )
      continue;
    const digest = sha256(
      await readFile(path.join(root, dataset.dataset_path)),
    );
    ensure(
      [...snapshots.values()]
        .filter((item) => item.provider === dataset.provider)
        .every((item) => item.dataset_sha256 === digest),
      `${dataset.provider}官方原表文件与食品快照来源摘要不一致`,
    );
  }
  return compileNutrition({
    source,
    config,
    legacy,
    profiles: document.profiles,
    assessments: assessments.recipes,
    snapshots,
    jobs: batches.flatMap((batch) =>
      Object.values(batch.jobs).map((job) => ({
        ...job,
        batch_id: batch.batch,
      })),
    ),
  });
}

export function compileNutrition({
  source,
  config,
  legacy,
  profiles,
  assessments,
  snapshots,
  jobs,
}) {
  const recipes = new Map(source.recipes.map((recipe) => [recipe.id, recipe]));
  const artworkForRecipe = new Map(
    config.artworks.flatMap((artwork) =>
      artwork.recipe_ids.map((id) => [id, artwork]),
    ),
  );
  const ids = new Set(),
    evaluated = new Map(),
    byArtwork = new Map(),
    defaults = {},
    files = [],
    summaries = [];
  for (const entry of assessments) {
    const recipe = recipes.get(entry.recipe_id);
    ensure(
      recipe &&
        artworkForRecipe.has(recipe.id) &&
        entry.recipe_blob_sha === recipe.blob_sha &&
        !evaluated.has(recipe.id),
      "评估映射缺失、重复或配方版本已变更",
    );
    ensure(
      [
        "candidate_pending",
        "missing_evidence",
        "no_match",
        "request_failed",
        "evaluated",
      ].includes(entry.status) &&
        entry.reasons?.length > 0 &&
        entry.evidence?.length > 0,
      "评估状态或依据缺失",
    );
    const knownCandidates = jobs
      .filter(
        (job) => job.recipe_id === entry.recipe_id && job.status === "complete",
      )
      .flatMap((job) =>
        job.results.flatMap((result) =>
          result.candidates.map((candidate) => candidate.fdc_id),
        ),
      );
    ensure(
      entry.candidate_fdc_ids.every((id) => knownCandidates.includes(id)),
      "候选FDC ID没有原始检索依据",
    );
    evaluated.set(entry.recipe_id, entry);
  }
  for (const profile of profiles) {
    const recipe = recipes.get(profile.recipe_id);
    validateProfile(profile, recipe);
    ensure(
      !ids.has(profile.id) && evaluated.has(profile.recipe_id),
      "营养方案重复或没有配方评估记录",
    );
    ids.add(profile.id);
    if (profile.review.status !== "approved") continue;
    const foodRecords = [];
    const resolve = (food) => {
      const record = readFoodSnapshot(
        snapshots.get(foodReferenceKey(food)) ?? {},
        food,
      );
      foodRecords.push(record);
      return record;
    };
    let values,
      calculation = null;
    if (profile.method === "usda_direct")
      values = resolve(profile.food).per_100g;
    else {
      ensure(
        profile.process?.retention_correction === "not_applied",
        "当前未实现营养保留率校正，不得声称已校正",
      );
      if (
        ![
          "household_serving_assumption",
          "household_recipe_assumption",
        ].includes(profile.final_weight?.method)
      )
        ensure(
          profile.process?.no_heating_after_weighing === true &&
            profile.process?.all_edible_material_retained === true,
          "当前计算规则仅支持无后续加热且全部保留的组合，或明确标记的家庭份蒸制估算",
        );
      calculation = calculateRecipe(
        profile.ingredients.map((ingredient) => ({
          ...ingredient,
          per_100g: resolve(ingredient.food).per_100g,
        })),
        profile.final_weight,
        profile.process,
      );
      values = calculation.per_100g;
    }
    ensure(
      Object.values(values).some((value) => value !== null),
      "已审核方案没有可发布的每100g数值",
    );
    ensure(
      profile.method === "recipe_estimate"
        ? foodRecords.some((food) => food.source.provider)
        : foodRecords.every((food) => !food.source.provider),
      "营养方法与实际食材来源不符，不可把其他来源伪装为USDA",
    );
    const complete = Object.values(values).every((value) => value !== null);
    const energyFromMacros = [
      values.protein_g,
      values.carbohydrate_g,
      values.fat_g,
    ].every((value) => value !== null)
      ? values.protein_g * 4 + values.carbohydrate_g * 4 + values.fat_g * 9
      : null;
    const warnings =
      energyFromMacros !== null &&
      values.energy_kcal !== null &&
      Math.abs(energyFromMacros - values.energy_kcal) >
        Math.max(10, values.energy_kcal * 0.2)
        ? ["4/4/9粗略折算与来源热量差异较大，保留来源热量，请复核"]
        : [];
    const sourceVersion = sha256(
      JSON.stringify({
        profile,
        sources: foodRecords.map((food) => food.source.raw_sha256),
        rules: RULES_VERSION,
      }),
    ).slice(0, 16);
    const summary = {
      id: profile.id,
      recipe_id: profile.recipe_id,
      recipe_blob_sha: profile.recipe_blob_sha,
      version: profile.version,
      data_version: sourceVersion,
      status: "reference",
      review_status: "approved",
      method: profile.method,
      ...(profile.estimation_level
        ? { estimation_level: profile.estimation_level }
        : {}),
      ...(profile.recipe_basis ? { recipe_basis: profile.recipe_basis } : {}),
      ...([
        "household_serving_assumption",
        "household_recipe_assumption",
      ].includes(profile.final_weight?.method)
        ? {
            estimate_confidence: profile.estimate_confidence,
            final_weight: profile.final_weight,
            retention_correction: profile.process.retention_correction,
          }
        : {}),
      basis: "per_100g",
      completeness: complete ? "complete" : "partial",
      scope: profile.scope,
      match: profile.match,
      per_100g: values,
      source: {
        name: [...new Set(foodRecords.map((food) => food.source.name))].join(
          " + ",
        ),
        url: foodRecords[0].source.url,
        version: sourceVersion,
        fdc_ids: foodRecords
          .map((food) => food.source.fdc_id)
          .filter(Number.isSafeInteger),
        ...(profile.method === "recipe_estimate"
          ? {
              providers: [
                ...new Set(
                  foodRecords.map((food) => food.source.provider ?? "usda"),
                ),
              ],
              food_ids: foodRecords
                .filter((food) => food.source.provider)
                .map((food) => ({
                  provider: food.source.provider,
                  id: food.source.food_id,
                })),
            }
          : {}),
      },
      rules_version: RULES_VERSION,
      is_estimate: ["usda_recipe_estimate", "recipe_estimate"].includes(
        profile.method,
      ),
      requires_independent_match: true,
    };
    const content = {
      schema_version: 1,
      ...summary,
      recipe_source: {
        url: recipe.source_url,
        source_commit: source.source_commit,
        blob_sha: recipe.blob_sha,
      },
      profile,
      source_records: foodRecords,
      calculation,
      quality_checks: { energy_from_macros_kcal: energyFromMacros, warnings },
      disclaimer:
        "仅供营养参考或配方估算，不代表用户实际摄入。图片匹配不能代替营养匹配。",
    };
    const text = JSON.stringify(content, null, 2) + "\n";
    const digest = sha256(text);
    summary.details = {
      path: `assets/nutrition/${profile.id}.${digest.slice(0, 16)}.json`,
      bytes: Buffer.byteLength(text),
      sha256: digest,
    };
    files.push({ path: summary.details.path, text });
    summaries.push(summary);
    const artwork = artworkForRecipe.get(profile.recipe_id);
    ensure(artwork, "营养方案没有对应插画");
    byArtwork.set(artwork.key, [
      ...(byArtwork.get(artwork.key) ?? []),
      summary,
    ]);
    if (profile.default_for_artwork) {
      ensure(
        artwork.recipe_ids.length === 1 && !defaults[artwork.key],
        "同图不同配方不得隐式设置通用默认营养",
      );
      const previous = legacy.entries[artwork.key];
      if (previous?.status === "reference")
        for (const [key, value] of Object.entries(previous.per_100g))
          ensure(
            value === null || value === values[key],
            "已有有效营养发生变化，须显式审核迁移，不能静默覆盖",
          );
      defaults[artwork.key] = {
        status: "reference",
        basis: "per_100g",
        serving_g: null,
        scope: profile.scope,
        per_100g: values,
        source: summary.source,
        ...previous,
        profile_id: profile.id,
        recipe_id: profile.recipe_id,
        review_status: "approved",
        method: profile.method,
        ...(profile.recipe_basis
          ? {
              recipe_basis: profile.recipe_basis,
              is_estimate: ["usda_recipe_estimate", "recipe_estimate"].includes(
                profile.method,
              ),
            }
          : {}),
        match: profile.match,
        data_version: sourceVersion,
        completeness: summary.completeness,
        rules_version: RULES_VERSION,
        details: summary.details,
        requires_independent_match: true,
      };
    }
  }
  const coverage = {
    total: artworkForRecipe.size,
    direct_reference: 0,
    recipe_estimate: 0,
    candidate_pending: 0,
    missing_evidence: 0,
    no_match: 0,
    request_failed: 0,
    not_assessed: 0,
  };
  const rows = [...artworkForRecipe].map(([id, artwork]) => {
    const approved = summaries.filter((profile) => profile.recipe_id === id),
      assessment = evaluated.get(id);
    const failed = jobs.find(
      (job) => job.recipe_id === id && job.status === "request_failed",
    );
    const generated = jobs.filter(
      (job) => job.recipe_id === id && job.status === "complete",
    );
    const status = approved.some((profile) => profile.method === "usda_direct")
      ? "direct_reference"
      : approved.length
        ? "recipe_estimate"
        : assessment?.status === "evaluated"
          ? "candidate_pending"
          : (assessment?.status ??
            (generated.length
              ? "candidate_pending"
              : failed
                ? "request_failed"
                : "not_assessed"));
    coverage[status]++;
    return {
      recipe_id: id,
      artwork_key: artwork.key,
      name: recipes.get(id).name,
      batch_id: jobs.find((job) => job.recipe_id === id)?.batch_id ?? null,
      status,
      review_status: approved.length
        ? "reference_available"
        : (assessment?.review_status ?? "not_reviewed"),
      blocker_code: assessment?.blocker_code ?? null,
      next_action: assessment?.next_action ?? null,
      evaluated_at: assessment?.evaluated_at ?? null,
      profile_ids: approved.map((profile) => profile.id),
      // 每篇菜谱直接带运行时营养摘要；同图多配方分别投影，使用方不必拼原始USDA数据。
      nutrition:
        approved.length === 1
          ? { ...approved[0], profile_id: approved[0].id }
          : {
              status: "unknown",
              basis: null,
              scope: null,
              per_100g: emptyNutrients(),
              source: null,
              requires_independent_match: true,
              reason:
                approved.length > 1
                  ? "multiple_scoped_profiles"
                  : "no_approved_reference",
            },
      reasons: assessment?.reasons ?? [
        generated.length
          ? "检索任务已完成，尚未核验配方与候选；无结果时仍须复核检索条件"
          : (failed?.reason ?? "尚未进入评估批次"),
      ],
      candidate_fdc_ids: assessment?.candidate_fdc_ids ?? [
        ...new Set(
          generated.flatMap((job) =>
            job.results.flatMap((result) =>
              result.candidates.map((candidate) => candidate.fdc_id),
            ),
          ),
        ),
      ],
    };
  });
  const indexBody = {
    schema_version: 1,
    rules_version: RULES_VERSION,
    source_commit: source.source_commit,
    coverage,
    reference_quality: {
      food_group_proxy: rows.filter(
        (row) => row.nutrition.estimation_level === "food_group_proxy",
      ).length,
      other_available: rows.filter(
        (row) =>
          row.profile_ids.length &&
          row.nutrition.estimation_level !== "food_group_proxy",
      ).length,
    },
    profiles: summaries,
    recipes: rows,
    usage:
      "按recipe_id、配方版本和match条件独立核对；food_group_proxy是同类食物粗估，不代表原食材实测；候选与未知不可用于计算，不匹配时查询其他来源。",
  };
  const index = {
    ...indexBody,
    version: sha256(JSON.stringify(indexBody)).slice(0, 16),
  };
  const labels = {
    direct_reference: "可用直接参考",
    recipe_estimate: "可用配方估算",
    candidate_pending: "候选待核验",
    missing_evidence: "缺少依据",
    no_match: "无合理匹配",
    request_failed: "请求待重试",
    not_assessed: "尚未评估",
  };
  const report = [
    "# 营养参考覆盖报告",
    "",
    `规则版本：${RULES_VERSION}。共${coverage.total}篇，已建立状态或候选任务${coverage.total - coverage.not_assessed}篇，其中${coverage.direct_reference + coverage.recipe_estimate}篇有可用营养方案。候选不等于审核通过；可用方案仍须核对适用范围。`,
    "",
    ...Object.entries(labels).map(
      ([key, label]) => `- ${label}：${coverage[key]}篇`,
    ),
    `- 其中同类食物代理粗估：${rows.filter((row) => row.nutrition.estimation_level === "food_group_proxy").length}篇（已计入配方估算，非新增菜谱或原食材精确匹配）`,
    "",
    "| 批次 | 菜谱数 | 有可用方案 | 待核验或补充 |",
    "| --- | --- | --- | --- |",
    ...[...new Set(rows.map((row) => row.batch_id).filter(Boolean))]
      .sort()
      .map((batch) => {
        const members = rows.filter((row) => row.batch_id === batch);
        const ready = members.filter(
          (row) => row.profile_ids.length > 0,
        ).length;
        return `| ${batch} | ${members.length} | ${ready} | ${members.length - ready} |`;
      }),
    "",
    "no_match只表示本轮核验候选无合理对应，不代表整个USDA数据库没有数据。缺少依据条目已写明具体缺项，不把家庭份成品重量未实测一律作为阻塞。",
    "",
    "| 菜谱 | 状态 | 说明 | 下一步 |",
    "| --- | --- | --- | --- |",
    ...rows
      .filter((row) => row.status !== "not_assessed")
      .map(
        (row) =>
          `| ${row.name} (${row.recipe_id}) | ${labels[row.status]} | ${row.reasons.join("；").replaceAll("|", " / ")} | ${(row.next_action ?? "按独立营养匹配条件使用").replaceAll("|", " / ")} |`,
      ),
    "",
    "完整372篇逐篇状态见 public/nutrition/index.json；未评估条目不计作已完成。",
    "",
  ].join("\n");
  for (const [key, value] of Object.entries(legacy.entries))
    ensure(
      value.status !== "reference" || defaults[key],
      "已有参考必须关联已审核默认方案，不能绕过营养审核流程",
    );
  return { defaults, byArtwork, index, files, report };
}
