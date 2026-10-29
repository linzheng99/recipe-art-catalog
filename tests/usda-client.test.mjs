import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  createUSDAClient,
  nutritionRoot,
  readJSON,
  atomicJSON,
  sha256,
} from "../scripts/nutrition-usda.mjs";
import { normalizeFoodCandidate, runUSDA } from "../scripts/usda.mjs";

const egg = await readJSON(
  path.join(nutritionRoot, "sources/nutrition/usda/173424.json"),
);
const sugar = await readJSON(
  path.join(nutritionRoot, "sources/nutrition/usda/169655.json"),
);
async function temporary(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "usda-client-test-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Key验证必须请求上游，缓存不能冒充有效Key，返回只含安全认证状态和配额", async () =>
  temporary(async (root) => {
    await atomicJSON(
      path.join(root, "sources/nutrition/usda/173424.json"),
      egg,
    );
    const credential = "test-only-auth-not-a-real-key";
    let calls = 0;
    const client = createUSDAClient({
      root,
      apiKey: credential,
      interval: 0,
      sleep: async () => {},
      fetchImpl: async (url, options) => {
        calls++;
        assert.equal(options.headers["X-Api-Key"], credential);
        assert.ok(!url.includes(credential));
        assert.equal(url, "https://api.nal.usda.gov/fdc/v1/foods/list");
        assert.deepEqual(JSON.parse(options.body), {
          pageSize: 1,
          pageNumber: 1,
        });
        return Response.json([{ fdcId: 173424 }], {
          headers: {
            "x-ratelimit-limit": "1000",
            "x-ratelimit-remaining": "999",
          },
        });
      },
    });
    const result = await client.checkKey();
    await client.checkKey();
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    assert.equal(result.rate_limit_remaining, "999");
    assert.ok(!JSON.stringify(result).includes(credential));
    await assert.rejects(
      () => readdir(path.join(root, "sources/nutrition/queries")),
      { code: "ENOENT" },
    );
    const bad = createUSDAClient({
      root,
      apiKey: credential,
      interval: 0,
      fetchImpl: async () => new Response("not authorized", { status: 403 }),
    });
    await assert.rejects(() => bad.checkKey(), /USDA HTTP 403/);
    const absent = createUSDAClient({
      root,
      fetchImpl: async () => {
        throw new Error("不应请求");
      },
    });
    await assert.rejects(() => absent.checkKey(), /FDC_API_KEY/);
  }));

test("实际缓存转换为待核验食物，净重换算不自动批准菜谱匹配", () => {
  const result = normalizeFoodCandidate(egg, { grams: 150 });
  assert.equal(result.review_status, "pending");
  assert.equal(result.approved_for_recipe, false);
  assert.equal(result.completeness, "complete");
  assert.deepEqual(result.portion, {
    edible_g: 150,
    nutrients: {
      energy_kcal: 232.5,
      protein_g: 18.87,
      carbohydrate_g: 1.68,
      fat_g: 15.915,
    },
  });
  assert.equal(result.source.fdc_id, 173424);
  assert.equal(result.nutrient_evidence.energy_kcal.nutrient_id, 1008);
  const partial = structuredClone(sugar);
  partial.response.foodNutrients = partial.response.foodNutrients.filter(
    (row) => row.nutrientId !== 1005,
  );
  partial.raw_sha256 = sha256(JSON.stringify(partial.response));
  const values = normalizeFoodCandidate(partial, { grams: 10 });
  assert.equal(values.completeness, "partial");
  assert.equal(values.per_100g.protein_g, 0);
  assert.equal(values.portion.nutrients.protein_g, 0);
  assert.equal(values.portion.nutrients.carbohydrate_g, null);
  partial.response.foodNutrients = [];
  partial.raw_sha256 = sha256(JSON.stringify(partial.response));
  assert.equal(normalizeFoodCandidate(partial).completeness, "unknown");
  assert.throws(
    () => normalizeFoodCandidate({ ...egg, raw_sha256: "broken" }),
    /摘要/,
  );
  for (const grams of [0, -1, Infinity])
    assert.throws(() => normalizeFoodCandidate(egg, { grams }), /克数/);
});

test("通用命令可搜索和离线处理，输出独立JSON，不修改原缓存或公开目录", async () =>
  temporary(async (root) => {
    const filename = path.join(root, "sources/nutrition/usda/173424.json");
    await atomicJSON(filename, egg);
    const original = await readFile(filename, "utf8");
    const client = {
      search: async (query) => ({
        retrieved_at: "2026-10-28",
        raw_sha256: "test-response",
        response: {
          totalHits: 2,
          foods: [
            {
              fdcId: 173424,
              description: "Egg hard-boiled",
              dataType: "SR Legacy",
            },
            { fdcId: 171287, description: "Egg raw", dataType: "SR Legacy" },
          ],
        },
      }),
    };
    const search = await runUSDA(["search", "egg"], { root, client });
    assert.equal(search.candidates.length, 2);
    assert.equal(search.review_status, "pending");
    assert.equal(search.selected, undefined);
    const output = path.join(root, ".cache/normalized.json");
    const result = await runUSDA(
      ["food", "173424", "--grams", "150", "--out", output],
      { root },
    );
    assert.equal(result.portion.nutrients.energy_kcal, 232.5);
    assert.deepEqual(await readJSON(output), result);
    const offline = await runUSDA(["normalize", filename], { root });
    assert.equal(offline.fdc_id, 173424);
    assert.equal(await readFile(filename, "utf8"), original);
    await assert.rejects(
      () =>
        runUSDA(
          ["food", "173424", "--out", path.join(root, "public/manifest.json")],
          { root },
        ),
      /覆盖/,
    );
    await assert.rejects(
      () => runUSDA(["food", "173424", "--grams", "-2"], { root }),
      /克数/,
    );
    await assert.rejects(
      () => runUSDA(["search", "one", "two"], { root, client }),
      /检索词/,
    );
  }));

test("真实CLI错误退出不泄露凭据，离线JSON输出可供其他应用消费", () => {
  const credential = "test-only-cli-credential-not-real";
  const env = { ...process.env, FDC_API_KEY: credential };
  const filename = path.join(
    nutritionRoot,
    "sources/nutrition/usda/173424.json",
  );
  const success = spawnSync(
    process.execPath,
    [
      path.join(nutritionRoot, "scripts/usda.mjs"),
      "normalize",
      filename,
      "--grams",
      "150",
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(success.status, 0);
  assert.equal(JSON.parse(success.stdout).portion.nutrients.energy_kcal, 232.5);
  const failure = spawnSync(
    process.execPath,
    [path.join(nutritionRoot, "scripts/usda.mjs"), "food", "bad-id"],
    { env, encoding: "utf8" },
  );
  assert.equal(failure.status, 1);
  assert.equal(failure.stdout, "");
  assert.ok(
    !(
      success.stdout +
      success.stderr +
      failure.stdout +
      failure.stderr
    ).includes(credential),
  );
});

test("USDA品牌检索和通用检索独立缓存，同一条件重跑不重复请求", async () =>
  temporary(async (root) => {
    const requests = [];
    const client = createUSDAClient({
      root,
      apiKey: "test-only-search-key",
      interval: 0,
      sleep: async () => {},
      fetchImpl: async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return Response.json({ foods: [] });
      },
    });
    await client.search("matching words");
    await client.search({ query: "matching words", data_types: ["Branded"] });
    await client.search({ query: "matching words", data_types: ["Branded"] });
    await client.search("matching words");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].dataType, [
      "SR Legacy",
      "Foundation",
      "Survey (FNDDS)",
    ]);
    assert.deepEqual(requests[1].dataType, ["Branded"]);
    assert.equal(
      (await readdir(path.join(root, "sources/nutrition/queries"))).length,
      2,
    );
    assert.throws(
      () => client.search({ query: "x", data_types: ["wrong"] }),
      /无效/,
    );
  }));
