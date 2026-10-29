import { readFile, writeFile, mkdir, rename, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const nutritionRoot = fileURLToPath(new URL("../", import.meta.url));
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const readJSON = async (filename) =>
  JSON.parse(await readFile(filename, "utf8"));
export async function atomicJSON(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(`${filename}.tmp`, JSON.stringify(value, null, 2) + "\n");
  await rename(`${filename}.tmp`, filename);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 只有显式指定的FDC ID才可导入；保留搜索响应中的原始对象与父响应摘要，不再重复请求同一数值。
export async function importSearchFood(id, root = nutritionRoot) {
  ensureID(id);
  const filename = path.join(root, "sources/nutrition/usda", `${id}.json`);
  try {
    return await readJSON(filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const directory = path.join(root, "sources/nutrition/queries");
  for (const name of (await readdir(directory)).sort()) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const query = await readJSON(path.join(directory, name));
    if (query.raw_sha256 !== sha256(JSON.stringify(query.response)))
      throw new Error("USDA 搜索缓存摘要不一致");
    const food = query.response.foods.find((food) => food.fdcId === id);
    if (!food) continue;
    const record = {
      schema_version: 1,
      provider: "USDA FoodData Central",
      transport: "api_search_snapshot",
      endpoint: query.endpoint,
      retrieved_at: query.retrieved_at,
      query_sha256: query.raw_sha256,
      raw_sha256: sha256(JSON.stringify(food)),
      response: food,
    };
    await atomicJSON(filename, record);
    return record;
  }
  throw new Error("指定FDC ID不在已有搜索缓存中");
}

function ensureID(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("非法FDC ID");
}

export function createUSDAClient({
  apiKey,
  root = nutritionRoot,
  fetchImpl = fetch,
  sleep = delay,
  now = () => new Date(),
  interval = 4000,
}) {
  let lastRequest = 0;
  async function reserveRequest() {
    const filename = path.join(root, ".cache/nutrition/api-quota.json");
    let state = {};
    try {
      state = await readJSON(filename);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const identity = sha256(apiKey);
    const time = now().getTime();
    const times = (state[identity] ?? []).filter(
      (value) => value > time - 86400000,
    );
    if (
      times.filter((value) => value > time - 3600000).length >=
        (apiKey === "DEMO_KEY" ? 30 : 900) ||
      (apiKey === "DEMO_KEY" && times.length >= 50)
    )
      throw new Error("USDA 本地请求预算已用完，请稍后重跑或使用官方批量数据");
    state[identity] = [...times, time];
    await atomicJSON(filename, state);
  }
  async function request(kind, identity, endpoint, payload) {
    const key =
      kind === "foods" ? String(identity) : sha256(JSON.stringify(identity));
    const filename = path.join(
      root,
      "sources/nutrition",
      kind === "foods" ? "usda" : "queries",
      `${key}.json`,
    );
    if (kind !== "keycheck") {
      try {
        const cached = await readJSON(filename);
        if (cached.raw_sha256 !== sha256(JSON.stringify(cached.response)))
          throw new Error("USDA 缓存摘要不一致");
        if (
          kind === "foods"
            ? cached.response.fdcId !== Number(identity)
            : !Array.isArray(cached.response.foods)
        )
          throw new Error("USDA 缓存内容错误");
        return cached;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (!apiKey)
      throw new Error(
        "缺少 FDC_API_KEY；可显式传入 --demo 试跑或导入官方批量数据",
      );
    const url = `https://api.nal.usda.gov/fdc/v1/${endpoint}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      await reserveRequest();
      await sleep(Math.max(0, interval - (Date.now() - lastRequest)));
      lastRequest = Date.now();
      let response;
      try {
        response = await fetchImpl(url, {
          method: payload ? "POST" : "GET",
          headers: {
            "X-Api-Key": apiKey,
            ...(payload ? { "Content-Type": "application/json" } : {}),
          },
          ...(payload ? { body: JSON.stringify(payload) } : {}),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        // 不传播带请求配置的异常，避免密钥进入日志或检查点。
        if (attempt === 3) throw new Error("USDA 请求超时或网络失败，待重试");
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = Number(retryAfter);
        const wait = retryAfter
          ? Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(retryAfter) - Date.now()
          : 1000 * 2 ** attempt;
        if (attempt === 3 || wait > 60000)
          throw new Error(`USDA HTTP ${response.status}，稍后重跑`);
        await response.body?.cancel();
        await sleep(Math.max(1000, Number.isFinite(wait) ? wait : 1000));
        continue;
      }
      if (!response.ok)
        throw new Error(`USDA HTTP ${response.status}，未更新已有数据`);
      const data = await response.json();
      if (kind === "keycheck") {
        if (!Array.isArray(data)) throw new Error("USDA 验证响应结构错误");
        return {
          ok: true,
          checked_at: now().toISOString(),
          endpoint: url,
          rate_limit: response.headers.get("x-ratelimit-limit"),
          rate_limit_remaining: response.headers.get("x-ratelimit-remaining"),
        };
      }
      if (
        kind === "foods"
          ? data.fdcId !== Number(identity)
          : !Array.isArray(data.foods)
      )
        throw new Error("USDA 响应结构错误，未写入缓存");
      const cached = {
        schema_version: 1,
        provider: "USDA FoodData Central",
        transport: "api",
        endpoint: url,
        ...(payload ? { request: payload } : {}),
        retrieved_at: now().toISOString(),
        raw_sha256: sha256(JSON.stringify(data)),
        response: data,
      };
      await atomicJSON(filename, cached);
      return cached;
    }
  }
  return {
    // 必须实际请求，避免缓存命中被误认为Key已经验证；不保存返回的食物数据。
    checkKey: () =>
      request("keycheck", "check", "foods/list", {
        pageSize: 1,
        pageNumber: 1,
      }),
    food: (id) => {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("非法 FDC ID");
      return request("foods", id, `food/${id}`);
    },
    search: (input) => {
      const query = typeof input === "string" ? input : input?.query;
      const dataTypes =
        typeof input === "string" ? undefined : input?.data_types;
      if (
        typeof query !== "string" ||
        !query.trim() ||
        (dataTypes !== undefined &&
          (!Array.isArray(dataTypes) ||
            !dataTypes.length ||
            dataTypes.some(
              (type) =>
                ![
                  "SR Legacy",
                  "Foundation",
                  "Survey (FNDDS)",
                  "Branded",
                ].includes(type),
            )))
      )
        throw new Error("无效USDA检索条件");
      const payload = {
        query,
        dataType: dataTypes ?? ["SR Legacy", "Foundation", "Survey (FNDDS)"],
        pageSize: 20,
        pageNumber: 1,
      };
      return request("queries", payload, "foods/search", payload);
    },
  };
}
