import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { readJSON, nutritionRoot } from "./nutrition-usda.mjs";
import {
  loadNutritionIndex,
  loadNutritionDetails,
} from "../src/lib/nutrition-client.mjs";

const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};

export async function verifyPublishedNutrition({
  baseURL,
  root = nutritionRoot,
  fetchImpl = fetch,
  attempts = 6,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  verifyChanges = false,
}) {
  const base = new URL(baseURL);
  ensure(
    ["https:", "http:"].includes(base.protocol) && base.pathname.endsWith("/"),
    "站点地址必须是以/结尾的HTTP目录",
  );
  ensure(
    Number.isInteger(attempts) && attempts > 0 && attempts <= 10,
    "重试次数必须为1–10",
  );
  const expected = await readJSON(
    path.join(root, "public/nutrition/index.json"),
  );
  const expectedManifest = await readJSON(
    path.join(root, "public/manifest-lite.json"),
  );
  const fetchFresh = async (url, options = {}) => {
    const requestURL = new URL(url);
    ensure(
      requestURL.origin === base.origin &&
        requestURL.pathname.startsWith(base.pathname),
      "发布资源超出站点目录",
    );
    requestURL.searchParams.set("nutrition_check", expected.version);
    const response = await fetchImpl(requestURL, {
      ...options,
      cache: "no-store",
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
    if (base.hostname.endsWith(".github.io"))
      ensure(
        response.headers.get("access-control-allow-origin") === "*",
        "公开JSON未允许跨域读取",
      );
    return response;
  };
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const manifestURL = new URL("manifest-lite.json", base);
      const manifestResponse = await fetchFresh(manifestURL);
      ensure(manifestResponse.ok, "线上图片目录请求失败");
      const manifest = await manifestResponse.json();
      ensure(
        manifest.version === expectedManifest.version,
        "线上图片目录版本尚未更新",
      );
      const loaded = await loadNutritionIndex(manifestURL, {
        fetchImpl: fetchFresh,
      });
      ensure(
        loaded.status === "available" && loaded.version === expected.version,
        "线上轻量营养目录不可用或版本不一致",
      );
      const fullResponse = await fetchFresh(
        new URL("nutrition/index.json", base),
      );
      ensure(fullResponse.ok, "线上完整营养目录请求失败");
      const full = await fullResponse.json();
      ensure(
        full.schema_version === 1 &&
          full.version === expected.version &&
          isDeepStrictEqual(full.recipes, expected.recipes),
        "线上完整营养数据不符合本次构建",
      );
      ensure(
        loaded.index.recipes.length === expected.recipes.length,
        "线上轻量目录覆盖不完整",
      );
      for (const row of expected.recipes) {
        const actual = loaded.index.recipes.find(
          (item) => item.recipe_id === row.recipe_id,
        );
        ensure(
          actual &&
            isDeepStrictEqual(actual.nutrition, row.nutrition) &&
            isDeepStrictEqual(actual.profile_ids, row.profile_ids),
          `轻量方案不一致：${row.recipe_id}`,
        );
      }
      const selected = new Map();
      for (const predicate of [
        (p) => p.method === "usda_direct",
        (p) => p.method === "usda_recipe_estimate",
        (p) => p.estimation_level === "food_group_proxy",
        (p) => p.source.providers?.includes("mext"),
        (p) => p.source.providers?.includes("krda"),
      ]) {
        const profile = loaded.index.profiles.find(predicate);
        if (profile) selected.set(profile.id, profile);
      }
      const grouped = new Map();
      for (const row of expected.recipes)
        grouped.set(row.artwork_key, [
          ...(grouped.get(row.artwork_key) ?? []),
          row.recipe_id,
        ]);
      for (const ids of grouped.values())
        if (ids.length > 1)
          for (const profile of loaded.index.profiles.filter((p) =>
            ids.includes(p.recipe_id),
          ))
            selected.set(profile.id, profile);
      for (const profile of selected.values()) {
        const result = await loadNutritionDetails(loaded, profile, {
          fetchImpl: fetchFresh,
        });
        ensure(
          result.status === "available",
          `线上详情校验失败：${profile.id}`,
        );
        ensure(
          isDeepStrictEqual(result.detail.per_100g, profile.per_100g),
          `详情与摘要数值不一致：${profile.id}`,
        );
      }
      if (verifyChanges) {
        const response = await fetchFresh(
          new URL("nutrition/changes.json", base),
        );
        ensure(response.ok, "本次营养变化摘要未发布");
        const changes = await response.json();
        ensure(
          changes.schema_version === 1 &&
            changes.to_version === expected.version,
          "营养变化摘要版本不一致",
        );
      }
      return {
        status: "verified",
        version: expected.version,
        recipes: expected.recipes.length,
        details_checked: selected.size,
        attempts: attempt,
      };
    } catch (error) {
      failure = error;
      if (attempt < attempts)
        await sleep(Math.min(16000, 2000 * 2 ** (attempt - 1)));
    }
  }
  throw failure;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    const result = await verifyPublishedNutrition({
      baseURL: args[0],
      verifyChanges: args.includes("--changes"),
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`线上营养验收未通过：${error.message}`);
    process.exitCode = 1;
  }
}
