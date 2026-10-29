import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  atomicJSON,
  createUSDAClient,
  importSearchFood,
  nutritionRoot,
  readJSON,
} from "./nutrition-usda.mjs";
import { readFoodSnapshot } from "./nutrition-model.mjs";

export async function syncIngredients({
  apiKey,
  limit = Infinity,
  root = nutritionRoot,
} = {}) {
  const plan = await readJSON(
    path.join(root, "catalog/nutrition/ingredients.json"),
  );
  const client = createUSDAClient({ apiKey, root });
  const file = path.join(
    root,
    "sources/nutrition/checkpoints/ingredients.json",
  );
  let state = { schema_version: 1, ingredients: {} };
  try {
    state = await readJSON(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let processed = 0;
  for (const item of plan.ingredients) {
    if (item.provider) continue;
    const query = item.data_types
      ? { query: item.query, data_types: item.data_types }
      : item.query;
    if (
      JSON.stringify(state.ingredients[item.key]?.query) ===
        JSON.stringify(query) &&
      state.ingredients[item.key]?.status === "complete"
    )
      continue;
    if (processed++ >= limit) break;
    try {
      const cached = await client.search(query);
      state.ingredients[item.key] = {
        query,
        status: "complete",
        raw_sha256: cached.raw_sha256,
        retrieved_at: cached.retrieved_at,
        candidates: cached.response.foods.map((food) => ({
          fdc_id: food.fdcId,
          description: food.description,
          data_type: food.dataType,
        })),
      };
    } catch {
      state.ingredients[item.key] = {
        query,
        status: "request_failed",
        reason: "USDA请求未完成，保留既有有效来源，重跑将复用已成功缓存。",
      };
    }
    await atomicJSON(file, state);
    console.log(`${item.key}: ${state.ingredients[item.key].status}`);
    // 上游失败时停在检查点，避免后续食材继续撞限流或反复超时。
    if (state.ingredients[item.key].status === "request_failed") break;
  }
  return state;
}

export async function resolveIngredient(item, root = nutritionRoot) {
  if (item.provider) {
    if (
      !/^[a-z]+$/.test(item.provider) ||
      !/^[a-zA-Z0-9-]+$/.test(item.food_id)
    )
      throw new Error("非法食物来源标识");
    const food = {
      provider: item.provider,
      food_id: item.food_id,
      description: item.description,
      data_type: item.data_type,
      snapshot_sha256: item.snapshot_sha256,
    };
    readFoodSnapshot(
      await readJSON(
        path.join(
          root,
          "sources/nutrition",
          item.provider,
          `${item.food_id}.json`,
        ),
      ),
      food,
    );
    return food;
  }
  if (!item.fdc_id || !item.description)
    throw new Error(`食材尚未明确选择并核验: ${item.key}`);
  const snapshot = await importSearchFood(item.fdc_id, root);
  const food = {
    fdc_id: item.fdc_id,
    description: item.description,
    data_type: item.data_type,
    snapshot_sha256: item.snapshot_sha256,
    ...(item.data_type === "Branded"
      ? {
          brand_owner: item.brand_owner,
          brand_name: item.brand_name,
          gtin_upc: item.gtin_upc,
        }
      : {}),
  };
  readFoodSnapshot(snapshot, food);
  return food;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const limitAt = process.argv.indexOf("--limit");
    const limit = limitAt < 0 ? Infinity : Number(process.argv[limitAt + 1]);
    if (!(limit > 0)) throw new Error("invalid limit");
    const state = await syncIngredients({
      apiKey: process.env.FDC_API_KEY,
      limit,
    });
    if (
      Object.values(state.ingredients).some(
        (item) => item.status === "request_failed",
      )
    )
      process.exitCode = 1;
  } catch {
    console.error("食材同步失败；检查配置或缓存后重跑，未输出凭据。");
    process.exitCode = 1;
  }
}
