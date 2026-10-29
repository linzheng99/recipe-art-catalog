import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  nutritionChanges,
  writeNutritionChanges,
} from "../scripts/nutrition-changes.mjs";
import { verifyPublishedNutrition } from "../scripts/verify-nutrition.mjs";

const publicRoot = new URL("../public/", import.meta.url);
const current = JSON.parse(
  await readFile(new URL("nutrition/index.json", publicRoot)),
);
const baseURL = "https://example.github.io/recipe-art-catalog/";
const localFetch = async (url) => {
  const parsed = new URL(url);
  assert.equal(parsed.origin + "/recipe-art-catalog/", baseURL);
  const relative = parsed.pathname.slice("/recipe-art-catalog/".length);
  const body =
    relative === "nutrition/changes.json"
      ? JSON.stringify({ schema_version: 1, to_version: current.version })
      : await readFile(new URL(relative, publicRoot));
  return new Response(body, {
    headers: { "access-control-allow-origin": "*" },
  });
};

test("营养变化区分新增、删除、数值与来源调整；未变数据不会冒充更新", () => {
  assert.deepEqual(nutritionChanges(current, current).counts, {
    added: 0,
    changed: 0,
    removed: 0,
  });
  const old = structuredClone(current);
  old.recipes = old.recipes.slice(0, 3);
  old.profiles = old.profiles.filter((p) =>
    old.recipes.some((r) => r.recipe_id === p.recipe_id),
  );
  const next = structuredClone(old);
  next.recipes[0].nutrition.per_100g.energy_kcal += 1;
  next.recipes[1].nutrition.source.version = "new-source-version";
  next.recipes.pop();
  next.recipes.push(current.recipes[3]);
  const report = nutritionChanges(old, next);
  assert.deepEqual(report.counts, { added: 1, changed: 2, removed: 1 });
  assert.equal(report.changes.length, 4);
  assert.equal(nutritionChanges(null, current).counts.added, 372);
});

test("实际Git基准输出变化JSON，支持大于1MiB的营养文件", async () => {
  const report = await writeNutritionChanges({
    baseRef: "HEAD",
    out: ".cache/nutrition/release-test.json",
    summary: null,
  });
  assert.equal(report.to_version, current.version);
  assert.equal(report.counts.added, 0);
  await assert.rejects(
    () => writeNutritionChanges({ baseRef: "--invalid" }),
    /基准/,
  );
});

test("发布验收验证372篇、跨域、轻重入口与典型详情，暂存旧版本可有界重试", async () => {
  let stale = true,
    sleeps = 0;
  const result = await verifyPublishedNutrition({
    baseURL,
    verifyChanges: true,
    sleep: async () => {
      sleeps++;
    },
    fetchImpl: async (url, options) => {
      assert.equal(options.cache, "no-store");
      if (stale) {
        stale = false;
        return Response.json(
          { version: "stale" },
          { headers: { "access-control-allow-origin": "*" } },
        );
      }
      return localFetch(url);
    },
  });
  assert.equal(result.status, "verified");
  assert.equal(result.recipes, 372);
  assert.ok(result.details_checked >= 6);
  assert.equal(result.attempts, 2);
  assert.equal(sleeps, 1);
});

test("发布验收拒绝损坏详情、未开放跨域和错误变更版本", async () => {
  for (const failure of ["details", "cors", "changes"]) {
    await assert.rejects(() =>
      verifyPublishedNutrition({
        baseURL,
        attempts: 1,
        verifyChanges: true,
        fetchImpl: async (url) => {
          const pathname = new URL(url).pathname;
          if (
            (failure === "details" && pathname.includes("assets/nutrition/")) ||
            (failure === "changes" && pathname.endsWith("changes.json"))
          )
            return Response.json(
              { bad: true },
              { headers: { "access-control-allow-origin": "*" } },
            );
          const response = await localFetch(url);
          if (failure === "cors")
            response.headers.delete("access-control-allow-origin");
          return response;
        },
      }),
    );
  }
});
