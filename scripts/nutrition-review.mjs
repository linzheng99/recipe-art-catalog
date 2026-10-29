import path from "node:path";
import { pathToFileURL } from "node:url";
import { atomicJSON, nutritionRoot, readJSON } from "./nutrition-usda.mjs";

// 只应用逐篇写出的审核结论，不根据关键词批量猜测缺项；已有可用方案优先。
export async function applyUnresolvedReviews({ root = nutritionRoot } = {}) {
  const load = (file) => readJSON(path.join(root, file));
  const [reviews, source, profiles, assessment] = await Promise.all(
    [
      "catalog/nutrition/reviews/unresolved.json",
      "catalog/howtocook.json",
      "catalog/nutrition/profiles.json",
      "catalog/nutrition/assessments.json",
    ].map(load),
  );
  const ready = new Set(
    profiles.profiles
      .filter((p) => p.review.status === "approved")
      .map((p) => p.recipe_id),
  );
  const seen = new Set();
  let applied = 0;
  for (const review of reviews.recipes) {
    const recipe = source.recipes.find((r) => r.id === review.recipe_id);
    if (
      !recipe ||
      recipe.blob_sha !== review.recipe_blob_sha ||
      seen.has(recipe.id) ||
      !["missing_evidence", "no_match"].includes(review.status) ||
      !review.reason ||
      !review.next_action ||
      !review.blocker_code
    )
      throw new Error("营养审核结论缺失、重复或来源版本改变");
    seen.add(recipe.id);
    if (ready.has(recipe.id)) continue;
    const entry = {
      recipe_id: recipe.id,
      recipe_blob_sha: recipe.blob_sha,
      status: review.status,
      review_status: "reviewed_without_reference",
      blocker_code: review.blocker_code,
      next_action: review.next_action,
      candidate_fdc_ids: [],
      reasons: [review.reason],
      evaluated_at: reviews.reviewed_at,
      reviewer: reviews.reviewer,
      checked_queries: review.checked_queries,
      ...(review.checked_external_candidates
        ? { checked_external_candidates: review.checked_external_candidates }
        : {}),
      evidence: [
        {
          url: recipe.source_url,
          blob_sha: recipe.blob_sha,
          note: `核对固定原文的食材、计算及加工分支。${review.reason} 下一步：${review.next_action}`,
        },
        ...(review.checked_external_candidates ?? []).map((candidate) => ({
          url: candidate.url,
          note: `${candidate.provider} ${candidate.food_id}: ${candidate.status}；仅为核验记录，不作为已批准营养。`,
        })),
      ],
    };
    const previous = assessment.recipes.findIndex(
      (r) => r.recipe_id === recipe.id,
    );
    if (previous >= 0) assessment.recipes[previous] = entry;
    else assessment.recipes.push(entry);
    applied++;
  }
  await atomicJSON(
    path.join(root, "catalog/nutrition/assessments.json"),
    assessment,
  );
  return { applied, assessment_count: assessment.recipes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await applyUnresolvedReviews()));
