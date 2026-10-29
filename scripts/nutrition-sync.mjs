import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createUSDAClient,
  importSearchFood,
  nutritionRoot,
  readJSON,
  atomicJSON,
  sha256,
} from "./nutrition-usda.mjs";

export async function syncBatch({
  batch,
  limit = Infinity,
  apiKey,
  root = nutritionRoot,
  client = createUSDAClient({ apiKey, root }),
}) {
  if (!/^batch-\d{3}$/.test(batch)) throw new Error("批次必须形如 batch-001");
  const plan = await readJSON(
    path.join(root, "catalog/nutrition/batches", `${batch}.json`),
  );
  const stateFile = path.join(
    root,
    "sources/nutrition/checkpoints",
    `${batch}.json`,
  );
  let previous;
  try {
    previous = await readJSON(stateFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const state = {
    schema_version: 1,
    batch,
    plan_sha256: sha256(JSON.stringify(plan)),
    jobs: previous?.jobs ?? {},
  };
  let processed = 0;
  // 每个任务先持久化检查点，重跑只读取已缓存响应；候选从不自动升级为可发布参考。
  for (const job of plan.jobs) {
    if (processed >= limit) break;
    const identity = sha256(JSON.stringify(job));
    if (state.jobs[identity]?.status === "complete") continue;
    try {
      const results = [];
      for (const query of job.queries) {
        const data = await client.search(query);
        results.push({
          query,
          raw_sha256: data.raw_sha256,
          retrieved_at: data.retrieved_at,
          candidates: data.response.foods.map((food) => ({
            fdc_id: food.fdcId,
            description: food.description,
            data_type: food.dataType,
          })),
        });
      }
      state.jobs[identity] = {
        recipe_id: job.recipe_id,
        status: "complete",
        results,
      };
    } catch (error) {
      const message = String(error?.message ?? "");
      const reason = /USDA HTTP 429|预算/.test(message)
        ? "USDA限流或本地请求预算已用完，稍后重跑"
        : /FDC_API_KEY/.test(message)
          ? "未配置FDC_API_KEY且无可用缓存"
          : /超时|网络/.test(message)
            ? "USDA网络失败或超时，待重试"
            : /缓存/.test(message)
              ? "原始缓存校验失败，需检查并修复缓存"
              : "USDA来源响应失败或结构异常，待重试";
      state.jobs[identity] = {
        recipe_id: job.recipe_id,
        status: "request_failed",
        reason: `${reason}；未覆盖有效营养`,
      };
    }
    await atomicJSON(stateFile, state);
    processed++;
  }
  return state;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  const value = (flag) => args[args.indexOf(flag) + 1];
  const apiKey =
    process.env.FDC_API_KEY ||
    (args.includes("--demo") ? "DEMO_KEY" : undefined);
  try {
    if (args.includes("--import-search")) {
      for (const id of value("--import-search").split(",").map(Number)) {
        const record = await importSearchFood(id);
        console.log(
          `已从缓存导入 FDC ${record.response.fdcId}: ${record.response.description}`,
        );
      }
    } else if (args.includes("--food")) {
      const client = createUSDAClient({ apiKey });
      for (const id of value("--food").split(",").map(Number)) {
        const record = await client.food(id);
        console.log(
          `已缓存 FDC ${record.response.fdcId}: ${record.response.description}`,
        );
      }
    } else {
      const limit = args.includes("--limit")
        ? Number(value("--limit"))
        : Infinity;
      if (!(limit > 0) || (limit !== Infinity && !Number.isSafeInteger(limit)))
        throw new Error("limit 必须是正整数");
      const result = await syncBatch({
        batch: args.includes("--batch") ? value("--batch") : "batch-001",
        limit,
        apiKey,
      });
      const jobs = Object.values(result.jobs);
      console.log(
        `${result.batch}: 候选任务完成 ${jobs.filter((job) => job.status === "complete").length}，待重试 ${jobs.filter((job) => job.status === "request_failed").length}；尚未代表营养审核完成`,
      );
      if (jobs.some((job) => job.status === "request_failed"))
        process.exitCode = 1;
    }
  } catch {
    console.error(
      "营养同步未完成；检查批次、FDC_API_KEY、网络或缓存，修复后可重跑。密钥与原始异常不会输出。",
    );
    process.exitCode = 1;
  }
}
