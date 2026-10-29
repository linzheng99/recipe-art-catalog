import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createUSDAClient,
  readJSON,
  atomicJSON,
  nutritionRoot,
} from "./nutrition-usda.mjs";
import { readFoodSnapshot, round } from "./nutrition-model.mjs";

// 这里只做USDA食物记录解析，不为任何菜谱批准匹配或默认营养。
export function normalizeFoodCandidate(snapshot, { grams } = {}) {
  const food = snapshot.response;
  const normalized = readFoodSnapshot(snapshot, {
    fdc_id: food?.fdcId,
    description: food?.description,
    data_type: food?.dataType,
    snapshot_sha256: snapshot.raw_sha256,
    ...(food?.dataType === "Branded"
      ? {
          brand_owner: food.brandOwner,
          brand_name: food.brandName ?? null,
          gtin_upc: food.gtinUpc,
        }
      : {}),
  });
  if (grams !== undefined && (!Number.isFinite(grams) || grams <= 0))
    throw new Error("可食克数必须为有限正数");
  const values = Object.values(normalized.per_100g);
  return {
    schema_version: 1,
    kind: "usda_food_candidate",
    fdc_id: food.fdcId,
    description: food.description,
    review_status: "pending",
    approved_for_recipe: false,
    requires_independent_match: true,
    basis: "per_100g",
    completeness: values.every((value) => value === null)
      ? "unknown"
      : values.every((value) => value !== null)
        ? "complete"
        : "partial",
    ...normalized,
    ...(grams !== undefined
      ? {
          portion: {
            edible_g: grams,
            nutrients: Object.fromEntries(
              Object.entries(normalized.per_100g).map(([key, value]) => [
                key,
                value === null ? null : round((value * grams) / 100),
              ]),
            ),
          },
        }
      : {}),
    notice:
      "这是USDA食物记录的数值解析，尚未核验与实际食物或菜谱的适用性。使用方需独立核对种类、部位、生熟、做法、配料、品牌和可食克数。",
  };
}

export async function runUSDA(
  args,
  {
    root = nutritionRoot,
    apiKey = process.env.FDC_API_KEY,
    client: providedClient,
  } = {},
) {
  const [command, ...rest] = args;
  const flags = new Map();
  const positional = [];
  for (let index = 0; index < rest.length; index++) {
    const value = rest[index];
    if (value === "--demo") {
      flags.set(value, true);
      continue;
    }
    if (value.startsWith("--")) {
      if (
        !["--grams", "--out", "--root", "--data-type"].includes(value) ||
        flags.has(value) ||
        !rest[index + 1] ||
        rest[index + 1].startsWith("--")
      )
        throw new Error("参数错误");
      flags.set(value, rest[++index]);
    } else positional.push(value);
  }
  const storageRoot = flags.has("--root")
    ? path.resolve(flags.get("--root"))
    : root;
  const output = flags.has("--out") ? path.resolve(flags.get("--out")) : null;
  if (output) {
    const protectedRoots = [root, storageRoot].flatMap((directory) =>
      ["public", "dist", "catalog", "sources"].map((name) =>
        path.resolve(directory, name),
      ),
    );
    if (
      protectedRoots.some(
        (directory) =>
          output === directory || output.startsWith(directory + path.sep),
      )
    )
      throw new Error(
        "输出请放到.cache或其他工作目录；不要覆盖源资料或公开产物",
      );
  }
  const client =
    providedClient ??
    createUSDAClient({
      root: storageRoot,
      apiKey: apiKey || (flags.has("--demo") ? "DEMO_KEY" : undefined),
    });
  const grams = flags.has("--grams") ? Number(flags.get("--grams")) : undefined;
  if (grams !== undefined && (!Number.isFinite(grams) || grams <= 0))
    throw new Error("可食克数必须为有限正数");
  let result;
  if (flags.has("--data-type") && command !== "search")
    throw new Error("--data-type只适用于检索");
  if (command === "check-key") {
    if (positional.length || grams !== undefined) throw new Error("参数错误");
    result = await client.checkKey();
  } else if (command === "search") {
    if (positional.length !== 1 || !positional[0].trim() || grams !== undefined)
      throw new Error("搜索需提供一条引号包围的检索词");
    const type = flags.get("--data-type");
    if (
      type &&
      !["SR Legacy", "Foundation", "Survey (FNDDS)", "Branded"].includes(type)
    )
      throw new Error("无效数据类型");
    const cached = await client.search(
      type ? { query: positional[0], data_types: [type] } : positional[0],
    );
    result = {
      schema_version: 1,
      kind: "usda_search_candidates",
      review_status: "pending",
      query: positional[0],
      retrieved_at: cached.retrieved_at,
      raw_sha256: cached.raw_sha256,
      total_hits: cached.response.totalHits,
      candidates: cached.response.foods.map((food) => ({
        fdc_id: food.fdcId,
        description: food.description,
        data_type: food.dataType,
        ...(food.dataType === "Branded"
          ? {
              brand_owner: food.brandOwner,
              brand_name: food.brandName ?? null,
              gtin_upc: food.gtinUpc,
            }
          : {}),
      })),
      notice:
        "仅返回第一页候选，不自动选择第一项。选定FDC ID后读取详情并核验适用范围。",
    };
  } else if (command === "food") {
    if (positional.length !== 1 || !/^[1-9]\d*$/.test(positional[0]))
      throw new Error("food需要一个正整数FDC ID");
    result = normalizeFoodCandidate(await client.food(Number(positional[0])), {
      grams,
    });
  } else if (command === "normalize") {
    if (positional.length !== 1)
      throw new Error("normalize需要一个原始缓存文件路径");
    result = normalizeFoodCandidate(await readJSON(positional[0]), { grams });
  } else
    throw new Error(
      "用法：check-key | search <检索词> | food <FDC ID> | normalize <缓存文件>；可选 --grams 150 --out <文件> --root <缓存根目录> --demo",
    );
  if (output) {
    // 通用工具只写本地派生结果；公开数据必须经项目审核、构建发布。
    await atomicJSON(output, result);
  }
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(await runUSDA(process.argv.slice(2)), null, 2));
  } catch (error) {
    const status = String(error?.message ?? "").match(/^USDA HTTP (\d{3})/);
    console.error(
      status
        ? `USDA HTTP ${status[1]}；检查Key、限流或来源服务后重试。`
        : "USDA命令未完成；检查FDC_API_KEY、命令参数、来源缓存和网络。命令：check-key | search <检索词> | food <FDC ID> | normalize <缓存路径>。凭据及原始异常不会输出。",
    );
    process.exitCode = 1;
  }
}
