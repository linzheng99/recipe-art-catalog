import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createUSDAClient,
  readJSON,
  atomicJSON,
  sha256,
  nutritionRoot,
} from "../scripts/nutrition-usda.mjs";
import {
  readFoodSnapshot,
  calculateRecipe,
  edibleGrams,
} from "../scripts/nutrition-model.mjs";
import {
  loadNutritionCatalog,
  compileNutrition,
} from "../scripts/nutrition-catalog.mjs";
import { syncBatch } from "../scripts/nutrition-sync.mjs";
import { importBulk } from "../scripts/nutrition-import.mjs";
import { applyNutritionPlans } from "../scripts/nutrition-plans.mjs";
import { applyUnresolvedReviews } from "../scripts/nutrition-review.mjs";

const load = (file) => readJSON(path.join(nutritionRoot, file));
const [
  source,
  config,
  legacy,
  document,
  assessments,
  checkpoint,
  corn,
  egg,
  tomato,
  sugar,
] = await Promise.all(
  [
    "catalog/howtocook.json",
    "catalog/illustrations.json",
    "catalog/nutrition.json",
    "catalog/nutrition/profiles.json",
    "catalog/nutrition/assessments.json",
    "sources/nutrition/checkpoints/batch-001.json",
    "sources/nutrition/usda/169999.json",
    "sources/nutrition/usda/173424.json",
    "sources/nutrition/usda/170457.json",
    "sources/nutrition/usda/169655.json",
  ].map(load),
);
const snapshots = new Map(
  await Promise.all(
    (await readdir(path.join(nutritionRoot, "sources/nutrition/usda")))
      .filter((name) => /^\d+\.json$/.test(name))
      .map(async (name) => [
        Number(name.replace(".json", "")),
        await load(`sources/nutrition/usda/${name}`),
      ]),
  ),
);
for (const name of (
  await readdir(path.join(nutritionRoot, "sources/nutrition/mext"))
).filter((name) => /^\d{5}\.json$/.test(name))) {
  snapshots.set(
    `mext:${name.slice(0, 5)}`,
    await load(`sources/nutrition/mext/${name}`),
  );
}
for (const name of (
  await readdir(path.join(nutritionRoot, "sources/nutrition/krda"))
).filter((name) => /^[A-Z][a-zA-Z0-9]{11}\.json$/.test(name))) {
  snapshots.set(
    `krda:${name.slice(0, -5)}`,
    await load(`sources/nutrition/krda/${name}`),
  );
}
const batchJobs = (
  await Promise.all(
    (await readdir(path.join(nutritionRoot, "sources/nutrition/checkpoints")))
      .filter((name) => /^batch-\d{3}\.json$/.test(name))
      .map((name) => load(`sources/nutrition/checkpoints/${name}`)),
  )
).flatMap((batch) => Object.values(batch.jobs));
const compile = (
  profiles = document.profiles,
  customSnapshots = new Map([
    [169999, corn],
    [173424, egg],
  ]),
) =>
  compileNutrition({
    source,
    config,
    legacy,
    profiles,
    assessments: assessments.recipes,
    snapshots: new Map([...snapshots, ...customSnapshots]),
    jobs: batchJobs,
  });
const temp = async (fn) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recipe-nutrition-test-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test("真实来源复核保留玉米值，全熟蛋按recipe_id与分支发布，完整覆盖372篇状态", async () => {
  const result = await loadNutritionCatalog(
    nutritionRoot,
    source,
    config,
    legacy,
  );
  assert.deepEqual(result.index.coverage, {
    total: 372,
    direct_reference: 7,
    recipe_estimate: 365,
    candidate_pending: 0,
    missing_evidence: 0,
    no_match: 0,
    request_failed: 0,
    not_assessed: 0,
  });
  assert.equal(
    new Set(result.index.recipes.map((row) => row.recipe_id)).size,
    372,
  );
  assert.deepEqual(
    result.defaults["dish-853f4dcc16af"].per_100g,
    legacy.entries["dish-853f4dcc16af"].per_100g,
  );
  const reference = result.index.profiles.find(
    (profile) => profile.id === "egg-hard-boiled-branch-v1",
  );
  assert.deepEqual(reference.per_100g, {
    energy_kcal: 155,
    protein_g: 12.58,
    carbohydrate_g: 1.12,
    fat_g: 10.61,
  });
  assert.equal(reference.match.variant, "fully_cooked_10_minute_branch");
  assert.equal(result.defaults["dish-7a681fba9fd0"], undefined);
  assert.equal(result.byArtwork.get("steamed-egg").length, 2);
  assert.equal(result.defaults["steamed-egg"], undefined);
  for (const file of result.files) {
    const profile = result.index.profiles.find(
      (profile) => profile.details.path === file.path,
    );
    assert.equal(sha256(file.text), profile.details.sha256);
    assert.equal(Buffer.byteLength(file.text), profile.details.bytes);
  }
});

test("来源值与缺失逐项处理，单位、负数、无穷和来源摘要异常拒绝，4/4/9不重写热量", () => {
  const expected = document.profiles[0].food;
  const partial = structuredClone(corn);
  partial.response.foodNutrients = partial.response.foodNutrients.filter(
    (row) => row.nutrient.id !== 1003,
  );
  partial.raw_sha256 = sha256(JSON.stringify(partial.response));
  const parsed = readFoodSnapshot(partial, {
    ...expected,
    snapshot_sha256: partial.raw_sha256,
  });
  assert.equal(parsed.per_100g.protein_g, null);
  assert.equal(parsed.per_100g.energy_kcal, 96);
  for (const value of [-1, Infinity]) {
    const broken = structuredClone(corn);
    broken.response.foodNutrients.find(
      (row) => row.nutrient.id === 1008,
    ).amount = value;
    broken.raw_sha256 = sha256(JSON.stringify(broken.response));
    assert.throws(
      () =>
        readFoodSnapshot(broken, {
          ...expected,
          snapshot_sha256: broken.raw_sha256,
        }),
      /数值或单位/,
    );
  }
  const unit = structuredClone(corn);
  unit.response.foodNutrients.find(
    (row) => row.nutrient.id === 1008,
  ).nutrient.unitName = "kJ";
  unit.raw_sha256 = sha256(JSON.stringify(unit.response));
  assert.throws(
    () =>
      readFoodSnapshot(unit, { ...expected, snapshot_sha256: unit.raw_sha256 }),
    /单位/,
  );
  assert.throws(
    () => readFoodSnapshot(corn, { ...expected, fdc_id: 173424 }),
    /FDC ID/,
  );
  assert.throws(
    () => readFoodSnapshot({ ...corn, raw_sha256: "a".repeat(64) }, expected),
    /摘要/,
  );
  assert.equal(compile().index.profiles[1].per_100g.energy_kcal, 155);
});

test("糖拌西红柿按显式净量和全部食用汁液估算，默认公开标注估算而非实测", () => {
  const result = compile();
  const profile = result.index.profiles.find(
    (item) => item.id === "tomato-sugar-standard-v1",
  );
  assert.equal(profile.method, "usda_recipe_estimate");
  assert.equal(profile.recipe_basis, "standardized_assumptions");
  assert.deepEqual(profile.per_100g, {
    energy_kcal: 51.545455,
    protein_g: 0.8,
    carbohydrate_g: 12.627273,
    fat_g: 0.181818,
  });
  const details = JSON.parse(
    result.files.find((file) => file.path === profile.details.path).text,
  );
  assert.deepEqual(details.calculation.total, {
    energy_kcal: 113.4,
    protein_g: 1.76,
    carbohydrate_g: 27.78,
    fat_g: 0.4,
  });
  assert.equal(details.calculation.final_edible_g, 220);
  assert.deepEqual(
    details.calculation.ingredients.map((ingredient) => ingredient.edible_g),
    [200, 20],
  );
  assert.equal(details.profile.final_weight.method, "cold_mix_mass_balance");
  assert.match(details.profile.final_weight.evidence, /非原文实测/);
  assert.equal(result.defaults["dish-d051be3bc11e"].is_estimate, true);
  assert.equal(
    result.defaults["dish-d051be3bc11e"].method,
    "usda_recipe_estimate",
  );
  const missing = structuredClone(document.profiles);
  missing[2].final_weight.basis = undefined;
  assert.throws(() => compile(missing), /成品重量基准/);
  const drained = structuredClone(document.profiles);
  drained[2].process.all_edible_material_retained = false;
  assert.throws(() => compile(drained), /全部保留/);
});

test("常见用量显式标准化，黄瓜油糖酱全部计入，燕麦采用熟食而非生料出成率", () => {
  const result = compile();
  const detail = (id) => {
    const profile = result.index.profiles.find((item) => item.id === id);
    return JSON.parse(
      result.files.find((file) => file.path === profile.details.path).text,
    );
  };
  const rice = detail("rice-short-grain-cooked-v1");
  assert.equal(rice.method, "usda_direct");
  assert.equal(rice.per_100g.energy_kcal, 130);
  assert.equal(rice.source_records[0].source.fdc_id, 168932);
  assert.match(rice.scope, /每100g熟重/);

  const cucumber = detail("cucumber-salad-standard-v1");
  assert.equal(cucumber.recipe_basis, "standardized_assumptions");
  assert.equal(cucumber.calculation.final_edible_g, 247.6);
  assert.equal(cucumber.calculation.total.energy_kcal, 125.79);
  assert.equal(cucumber.per_100g.energy_kcal, 50.803716);
  assert.equal(cucumber.match.all_juice_consumed, true);
  const portions = new Map(
    cucumber.calculation.ingredients.map((item) => [
      item.food.fdc_id,
      item.edible_g,
    ]),
  );
  assert.equal(portions.get(171016), 6);
  assert.equal(portions.get(169655), 5);
  assert.equal(portions.get(174277), 9);
  assert.equal(portions.get(174529), 6);
  assert.ok(
    cucumber.calculation.ingredients.every(
      (item) => item.quantity.unit === "g",
    ),
  );

  const oats = detail("milk-oats-cooked-components-v1");
  assert.equal(oats.calculation.final_edible_g, 530);
  assert.equal(oats.calculation.total.energy_kcal, 410.8);
  assert.equal(oats.per_100g.energy_kcal, 77.509434);
  assert.deepEqual(
    oats.calculation.ingredients.map((item) => [
      item.food.fdc_id,
      item.source_state,
      item.edible_g,
    ]),
    [
      [173905, "cooked", 200],
      [172217, "ready_to_eat", 280],
      [173423, "cooked", 50],
    ],
  );
  assert.match(oats.scope, /已含其烹调脂肪/);
  assert.match(oats.scope, /不声称等于原文40g干燕麦/);
});

test("两篇同图蒸蛋按2–3人家庭份分别估算，成品重假设与来源数据分开", () => {
  const result = compile();
  const profiles = result.byArtwork.get("steamed-egg");
  assert.equal(profiles.length, 2);
  assert.equal(new Set(profiles.map((item) => item.recipe_id)).size, 2);
  assert.equal(result.defaults["steamed-egg"], undefined);
  for (const [id, grams, energy] of [
    ["steamed-water-egg-family-v1", 360, 214.5],
    ["savory-egg-custard-family-v1", 350, 245.79],
  ]) {
    const summary = profiles.find((item) => item.id === id);
    const details = JSON.parse(
      result.files.find((file) => file.path === summary.details.path).text,
    );
    assert.equal(summary.estimate_confidence, "low");
    assert.equal(summary.final_weight.is_measured, false);
    assert.deepEqual(summary.final_weight.servings, { min: 2, max: 3 });
    assert.equal(summary.final_weight.method, "household_serving_assumption");
    assert.equal(summary.retention_correction, "not_applied");
    assert.equal(details.calculation.final_edible_g, grams);
    assert.equal(details.calculation.total.energy_kcal, energy);
    assert.ok(
      Math.abs((summary.per_100g.energy_kcal * grams) / 100 - energy) < 0.00001,
    );
    assert.notEqual(
      details.calculation.ingredients.reduce(
        (sum, item) => sum + item.edible_g,
        0,
      ),
      grams,
    );
    assert.match(summary.scope, /成品重是家庭份假设，非实测/);
  }

  const changed = structuredClone(document.profiles);
  const family = changed.find(
    (item) => item.id === "steamed-water-egg-family-v1",
  );
  family.final_weight.grams = 300;
  const recalculated = compile(changed).index.profiles.find(
    (item) => item.id === family.id,
  );
  assert.equal(recalculated.per_100g.energy_kcal, 71.5);
  family.estimate_confidence = "high";
  assert.throws(() => compile(changed), /低置信度/);
  family.estimate_confidence = "low";
  family.final_weight.is_measured = true;
  assert.throws(() => compile(changed), /非实测标记/);
  family.final_weight.is_measured = false;
  family.process.no_nutrient_bearing_liquid_discarded = false;
  assert.throws(() => compile(changed), /无弃汁/);
  family.process.no_nutrient_bearing_liquid_discarded = true;
  family.process.method = "deep_fried";
  assert.throws(() => compile(changed), /带盖蒸制/);
});

// 纯算术合成夹具，不是新增的营养参考，不会写入公开目录。
const ingredient = (value, values) => ({
  name: "算术测试原料",
  quantity: {
    value,
    unit: "g",
    edible: true,
    state: "raw",
    evidence: "合成测试净重",
  },
  source_state: "raw",
  per_100g: values,
});
const coldProcess = {
  no_heating_after_weighing: true,
  all_edible_material_retained: true,
};
test("完整与部分已知的配方结果分别发布，检索完成只进入候选待核验", () => {
  // 合成配方仅验证编译分支，明确不进入本批公开资料。
  const profiles = structuredClone(document.profiles.slice(0, 3));
  profiles[1].method = "usda_recipe_estimate";
  profiles[1].process = { ...coldProcess, retention_correction: "not_applied" };
  profiles[1].ingredients = [
    {
      name: "测试用熟蛋",
      food: profiles[1].food,
      source_state: "cooked",
      quantity: {
        value: 100,
        unit: "g",
        edible: true,
        state: "cooked",
        evidence: "合成测试净重",
      },
    },
  ];
  profiles[1].final_weight = {
    grams: 100,
    method: "cold_mix_mass_balance",
    evidence: "合成测试，全部保留",
  };
  const full = compile(profiles);
  assert.equal(full.index.profiles[1].method, "usda_recipe_estimate");
  assert.equal(full.index.profiles[1].completeness, "complete");
  assert.equal(full.index.profiles[1].per_100g.energy_kcal, 155);
  const partial = structuredClone(egg);
  partial.response.foodNutrients = partial.response.foodNutrients.filter(
    (row) => row.nutrient.id !== 1003,
  );
  partial.raw_sha256 = sha256(JSON.stringify(partial.response));
  profiles[1].ingredients[0].food.snapshot_sha256 = partial.raw_sha256;
  const result = compile(
    profiles,
    new Map([
      [169999, corn],
      [173424, partial],
    ]),
  );
  assert.equal(result.index.profiles[1].completeness, "partial");
  assert.equal(result.index.profiles[1].per_100g.protein_g, null);
  const rows = assessments.recipes.filter(
    (row) => row.recipe_id !== "howtocook-cf3dabc066de",
  );
  const generated = compileNutrition({
    source,
    config,
    legacy,
    profiles: document.profiles.filter(
      (profile) => profile.recipe_id !== "howtocook-cf3dabc066de",
    ),
    assessments: rows,
    snapshots,
    jobs: batchJobs,
  });
  const rice = generated.index.recipes.find(
    (row) => row.recipe_id === "howtocook-cf3dabc066de",
  );
  assert.equal(rice.status, "candidate_pending");
  assert.deepEqual(rice.profile_ids, []);
});
test("整份与每100g换算独立，缺少成品重量或任一食材该营养素未知时不填0", () => {
  const ingredients = [
    ingredient(100, {
      energy_kcal: 100,
      protein_g: 10,
      carbohydrate_g: null,
      fat_g: 2,
    }),
    ingredient(50, {
      energy_kcal: 200,
      protein_g: 0,
      carbohydrate_g: 5,
      fat_g: 4,
    }),
  ];
  const calculated = calculateRecipe(
    ingredients,
    {
      grams: 150,
      method: "cold_mix_mass_balance",
      evidence: "合成冷拌全部保留",
    },
    coldProcess,
  );
  assert.deepEqual(calculated.total, {
    energy_kcal: 200,
    protein_g: 10,
    carbohydrate_g: null,
    fat_g: 4,
  });
  assert.deepEqual(calculated.per_100g, {
    energy_kcal: 133.333333,
    protein_g: 6.666667,
    carbohydrate_g: null,
    fat_g: 2.666667,
  });
  assert.deepEqual(calculateRecipe(ingredients, null, coldProcess).per_100g, {
    energy_kcal: null,
    protein_g: null,
    carbohydrate_g: null,
    fat_g: null,
  });
  assert.throws(
    () =>
      calculateRecipe(
        ingredients,
        { grams: 150, method: "raw_weight_sum", evidence: "炒后假设原重" },
        {},
      ),
    /成品重量/,
  );
  assert.throws(
    () =>
      calculateRecipe(
        ingredients,
        { grams: 150, method: "cold_mix_mass_balance", evidence: "加热后" },
        { ...coldProcess, no_heating_after_weighing: false },
      ),
    /质量守恒/,
  );
  assert.throws(
    () =>
      calculateRecipe(
        [{ ...ingredients[0], source_state: "cooked" }],
        null,
        coldProcess,
      ),
    /生熟/,
  );
  assert.throws(
    () =>
      calculateRecipe(
        [ingredient(100, { energy_kcal: 100 })],
        null,
        coldProcess,
      ),
    /null/,
  );
});

test("ml换g须具备适用密度、来源、版本和可食部分依据", () => {
  const q = {
    value: 10,
    unit: "ml",
    edible: true,
    state: "raw",
    evidence: "合成测试",
  };
  assert.throws(() => edibleGrams(q), /密度/);
  assert.equal(
    edibleGrams({
      ...q,
      density: {
        g_per_ml: 0.9,
        source_url: "https://example.com/test-density",
        version: "test-only",
        conditions: "合成测试",
      },
    }),
    9,
  );
  assert.throws(() => edibleGrams({ ...q, unit: "g", edible: false }), /可食/);
});

test("待审核候选不发布，旧审核不能沿用到新配方、不同食物或多配方默认", () => {
  const pending = structuredClone(document.profiles);
  pending[1].review.status = "pending";
  assert.equal(
    compile(pending).index.profiles.length,
    document.profiles.filter((profile) => profile.review.status === "approved")
      .length - 1,
  );
  const changed = structuredClone(document.profiles);
  changed[1].recipe_blob_sha = "0".repeat(40);
  assert.throws(() => compile(changed), /配方版本/);
  const wrongFood = structuredClone(document.profiles);
  wrongFood[1].food.description = "Egg raw";
  assert.throws(() => compile(wrongFood), /描述/);
  const shared = structuredClone(document.profiles),
    recipe = source.recipes.find(
      (item) => item.id === "howtocook-b13f782654bf",
    );
  Object.assign(shared[1], {
    recipe_id: recipe.id,
    recipe_blob_sha: recipe.blob_sha,
    default_for_artwork: true,
  });
  assert.throws(() => compile(shared), /同图不同配方/);
  assert.throws(
    () => compile([...document.profiles, document.profiles[1]]),
    /重复/,
  );
  const changedSource = structuredClone(corn);
  changedSource.response.foodNutrients.find(
    (row) => row.nutrient.id === 1008,
  ).amount = 97;
  changedSource.raw_sha256 = sha256(JSON.stringify(changedSource.response));
  const conflict = structuredClone(document.profiles);
  conflict[0].food.snapshot_sha256 = changedSource.raw_sha256;
  assert.throws(
    () =>
      compile(
        conflict,
        new Map([
          [169999, changedSource],
          [173424, egg],
        ]),
      ),
    /已有有效营养/,
  );
});

test("API处理429重试与缓存复用，私人凭据只在请求头，不写入任何缓存或错误", async () =>
  temp(async (root) => {
    const secret = "synthetic-test-credential-not-a-real-api-key";
    let calls = 0;
    const sleeps = [];
    const client = createUSDAClient({
      apiKey: secret,
      root,
      interval: 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchImpl: async (url, options) => {
        calls++;
        assert.equal(options.headers["X-Api-Key"], secret);
        assert.ok(!url.includes(secret));
        return calls === 1
          ? new Response("", { status: 429, headers: { "retry-after": "1" } })
          : Response.json(corn.response);
      },
    });
    await client.food(169999);
    await client.food(169999);
    assert.equal(calls, 2);
    assert.ok(sleeps.includes(1000));
    const text = await readFile(
      path.join(root, "sources/nutrition/usda/169999.json"),
      "utf8",
    );
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes("api_key"));
    const offline = createUSDAClient({
      root,
      fetchImpl: () => {
        throw new Error("不应请求");
      },
    });
    assert.equal((await offline.food(169999)).response.fdcId, 169999);
    let failed = 0;
    const errorClient = createUSDAClient({
      apiKey: secret,
      root,
      interval: 0,
      sleep: async () => {},
      fetchImpl: async () => {
        failed++;
        throw new Error(secret);
      },
    });
    await assert.rejects(
      () => errorClient.food(171287),
      (error) => !error.message.includes(secret),
    );
    assert.equal(failed, 4);
    assert.equal(
      await readFile(
        path.join(root, "sources/nutrition/usda/169999.json"),
        "utf8",
      ),
      text,
    );
  }));

test("无Key、有损缓存、非法响应和本地配额均不能静默覆盖已有来源", async () =>
  temp(async (root) => {
    await assert.rejects(
      () => createUSDAClient({ root }).food(169999),
      /FDC_API_KEY/,
    );
    await atomicJSON(path.join(root, "sources/nutrition/usda/169999.json"), {
      ...corn,
      raw_sha256: "bad",
    });
    let calls = 0;
    const client = createUSDAClient({
      apiKey: "test-only",
      root,
      interval: 0,
      sleep: async () => {},
      fetchImpl: async () => {
        calls++;
        return Response.json({ fdcId: 123 });
      },
    });
    await assert.rejects(() => client.food(169999), /摘要/);
    assert.equal(calls, 0);
    await assert.rejects(() => client.food(173424), /结构/);
    assert.equal(calls, 1);
    const date = new Date("2026-10-27T00:00:00Z");
    await atomicJSON(path.join(root, ".cache/nutrition/api-quota.json"), {
      [sha256("DEMO_KEY")]: Array(30).fill(date.getTime()),
    });
    const limited = createUSDAClient({
      apiKey: "DEMO_KEY",
      root,
      now: () => date,
      fetchImpl: () => {
        throw new Error("不应请求");
      },
    });
    await assert.rejects(() => limited.food(173424), /预算/);
  }));

test("分批任务断点续跑且失败可重试，不把候选完成算作营养批准", async () =>
  temp(async (root) => {
    await atomicJSON(
      path.join(root, "catalog/nutrition/batches/batch-001.json"),
      {
        jobs: [
          { recipe_id: "one", queries: ["one"] },
          { recipe_id: "two", queries: ["two"] },
        ],
      },
    );
    let calls = 0;
    const client = {
      search: async (query) => {
        calls++;
        if (query === "two" && calls === 2) throw new Error("network");
        return {
          raw_sha256: "fixture",
          retrieved_at: "2026-10-27",
          response: { foods: [] },
        };
      },
    };
    let state = await syncBatch({ batch: "batch-001", limit: 1, root, client });
    assert.equal(Object.keys(state.jobs).length, 1);
    state = await syncBatch({ batch: "batch-001", limit: 1, root, client });
    assert.equal(Object.values(state.jobs)[1].status, "request_failed");
    state = await syncBatch({ batch: "batch-001", limit: 1, root, client });
    assert.equal(Object.values(state.jobs)[1].status, "complete");
    await syncBatch({ batch: "batch-001", root, client });
    assert.equal(calls, 3);
    assert.equal(Object.keys(state.jobs).length, 2);
  }));

test("官方批量导入无需Key，保留原始摘要，重跑不重复或覆盖，缺失ID先拒绝", async () =>
  temp(async (root) => {
    const filename = path.join(root, "sample.json");
    await atomicJSON(filename, {
      SRLegacyFoods: [corn.response, egg.response],
    });
    const options = {
      filename,
      ids: [169999, 173424],
      datasetURL: "https://fdc.nal.usda.gov/fdc-datasets/test.json",
      release: "test-fixture",
      root,
    };
    assert.equal(
      (await importBulk(options))[0].status,
      "imported_pending_review",
    );
    const before = await readFile(
      path.join(root, "sources/nutrition/usda/169999.json"),
      "utf8",
    );
    assert.ok(
      (await importBulk(options)).every(
        (item) => item.status === "cached_unchanged",
      ),
    );
    assert.equal(
      await readFile(
        path.join(root, "sources/nutrition/usda/169999.json"),
        "utf8",
      ),
      before,
    );
    assert.equal(
      (await readdir(path.join(root, "sources/nutrition/usda"))).length,
      2,
    );
    await assert.rejects(() => importBulk({ ...options, ids: [1] }), /缺失/);
    await assert.rejects(
      () => importBulk({ ...options, datasetURL: "https://example.com/fake" }),
      /官方/,
    );
  }));

test("公开JSON保持旧接入字段和图片摘要不变，未知同图方案不误合并，营养详情摘要正确", async () => {
  const [full, lite, index, variants] = await Promise.all(
    [
      "public/manifest.json",
      "public/manifest-lite.json",
      "public/nutrition/index.json",
      "catalog/variants.json",
    ].map(load),
  );
  assert.equal(full.schema_version, 1);
  assert.equal(lite.schema_version, 1);
  assert.equal(full.nutrition_catalog.version, index.version);
  const approved = new Map(
    index.profiles.map((profile) => [profile.id, profile]),
  );
  for (const recipe of index.recipes) {
    const nutrition = recipe.nutrition;
    if (recipe.profile_ids.length === 1) {
      const profile = approved.get(recipe.profile_ids[0]);
      assert.equal(nutrition.recipe_id, recipe.recipe_id);
      assert.deepEqual(nutrition.per_100g, profile.per_100g);
      assert.equal(nutrition.data_version, profile.data_version);
    } else {
      assert.equal(nutrition.status, "unknown");
      assert.ok(
        Object.values(nutrition.per_100g).every((value) => value === null),
      );
    }
  }
  const canonical = new Map(
    variants.artworks.map((artwork) => [artwork.key, artwork.variants]),
  );
  for (const artwork of full.artworks) {
    assert.deepEqual(artwork.variants, canonical.get(artwork.key));
    const compact = lite.artworks.find(
      (item) => item.key === artwork.key,
    ).nutrition;
    for (const key of [
      "status",
      "basis",
      "per_100g",
      "source",
      "method",
      "review_status",
      "profile_id",
    ])
      assert.deepEqual(artwork.nutrition[key], compact[key]);
  }
  assert.equal(
    full.artworks.find((item) => item.key === "dish-7a681fba9fd0").nutrition
      .status,
    "unknown",
  );
  assert.equal(
    full.artworks.find((item) => item.key === "steamed-egg").nutrition.status,
    "unknown",
  );
  for (const profile of index.profiles) {
    const data = await readFile(
      path.join(nutritionRoot, "public", profile.details.path),
    );
    assert.equal(sha256(data), profile.details.sha256);
    assert.equal(data.length, profile.details.bytes);
    assert.equal(JSON.parse(data).review_status, "approved");
  }
});

test("全部菜谱有逐篇结论，未发布条目有具体缺项与下一步，不把家庭成品重量当作统一阻塞", async () => {
  const result = await loadNutritionCatalog(
    nutritionRoot,
    source,
    config,
    legacy,
  );
  assert.equal(assessments.recipes.length, 372);
  const unresolved = result.index.recipes.filter(
    (row) => !row.profile_ids.length,
  );
  assert.equal(unresolved.length, 0);
  for (const row of unresolved) {
    assert.equal(row.review_status, "reviewed_without_reference");
    assert.ok(row.blocker_code && row.next_action && row.reasons.length);
    assert.equal(row.nutrition.status, "unknown");
    assert.ok(
      Object.values(row.nutrition.per_100g).every((value) => value === null),
    );
  }
  const branded = result.index.profiles.filter(
    (profile) => profile.match.brand,
  );
  assert.ok(branded.length > 20);
  for (const profile of branded) {
    assert.match(profile.match.brand, /GTIN/);
    const detail = JSON.parse(
      result.files.find((file) => file.path === profile.details.path).text,
    );
    assert.ok(
      detail.source_records.some(
        (food) => food.source.data_type === "Branded" && food.source.gtin_upc,
      ),
    );
    const key = result.index.recipes.find(
      (row) => row.recipe_id === profile.recipe_id,
    ).artwork_key;
    assert.notEqual(result.defaults[key]?.profile_id, profile.id);
  }
});

test("油炸家庭份仅计算保留油和裹粉，拒绝未声明或不一致的吸油量", () => {
  const result = compile();
  const summary = result.index.profiles.find(
    (p) => p.id === "family-788feaed2146-v1",
  );
  const detail = JSON.parse(
    result.files.find((f) => f.path === summary.details.path).text,
  );
  const { ingredients } = detail.calculation;
  const { final_weight, process } = detail.profile;
  const calculated = calculateRecipe(ingredients, final_weight, process);
  assert.equal(calculated.total.energy_kcal, 1075.11);
  assert.equal(calculated.per_100g.energy_kcal, 179.185);
  assert.equal(calculated.final_edible_g, 600);
  assert.equal(process.assumed_retained_oil_g, 30);
  assert.equal(
    ingredients.find((i) => i.quantity.role === "retained_frying_oil").edible_g,
    30,
  );
  assert.match(summary.scope, /不计油锅余油/);
  const changed = structuredClone(ingredients);
  changed.find(
    (i) => i.quantity.role === "retained_frying_oil",
  ).quantity.value = 40;
  assert.throws(
    () => calculateRecipe(changed, final_weight, process),
    /吸油量与营养计算输入不一致/,
  );
  assert.throws(
    () =>
      calculateRecipe(ingredients, final_weight, {
        ...process,
        oil_is_retained_portion: false,
      }),
    /油锅投油量/,
  );
  assert.throws(
    () =>
      calculateRecipe(ingredients, final_weight, {
        ...process,
        breading_is_retained_portion: false,
      }),
    /保留裹粉/,
  );
});

test("标准配方和缺项结论可重复应用，无重复方案、不改变既有值或审核时间", async () =>
  temp(async (root) => {
    const files = [
      "catalog/howtocook.json",
      "catalog/illustrations.json",
      "catalog/nutrition/profiles.json",
      "catalog/nutrition/assessments.json",
      "catalog/nutrition/plans/standard-families.json",
      "catalog/nutrition/ingredients.json",
      "catalog/nutrition/reviews/unresolved.json",
    ];
    for (const file of files)
      await atomicJSON(path.join(root, file), await load(file));
    const before = await Promise.all(
      files.map((file) => readFile(path.join(root, file), "utf8")),
    );
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal((await applyNutritionPlans({ root })).added, 0);
      assert.equal(
        (await applyUnresolvedReviews({ root })).assessment_count,
        372,
      );
    }
    assert.deepEqual(
      await Promise.all(
        files.map((file) => readFile(path.join(root, file), "utf8")),
      ),
      before,
    );
  }));

test("品牌来源独立核对GTIN及生产商，不把待核验标签自动批准给菜谱", async () => {
  const raw = await load("sources/nutrition/usda/2442977.json");
  const food = document.profiles
    .flatMap((profile) => profile.ingredients ?? [])
    .find((item) => item.food.fdc_id === 2442977).food;
  assert.equal(readFoodSnapshot(raw, food).source.gtin_upc, "072869351029");
  assert.throws(
    () => readFoodSnapshot(raw, { ...food, gtin_upc: "wrong-product" }),
    /GTIN/,
  );
  assert.throws(
    () => readFoodSnapshot(raw, { ...food, brand_owner: "different-company" }),
    /GTIN/,
  );
});

test("质量合理性拒绝失真的来源或过低成品重量，同时不改写来源热量", () => {
  const impossible = structuredClone(corn);
  for (const [id, amount] of [
    [1003, 60],
    [1004, 60],
  ])
    impossible.response.foodNutrients.find(
      (row) => row.nutrient.id === id,
    ).amount = amount;
  impossible.raw_sha256 = sha256(JSON.stringify(impossible.response));
  assert.throws(
    () =>
      readFoodSnapshot(impossible, {
        ...document.profiles[0].food,
        snapshot_sha256: impossible.raw_sha256,
      }),
    /质量上限/,
  );
  assert.throws(
    () =>
      calculateRecipe(
        [
          ingredient(100, {
            energy_kcal: 400,
            protein_g: 10,
            carbohydrate_g: 80,
            fat_g: 2,
          }),
        ],
        {
          grams: 50,
          method: "measured",
          evidence: "仅测试的错误重量",
          source_url: "https://example.com/test-fixture",
          version: "test-only",
        },
        coldProcess,
      ),
    /质量上限/,
  );
});
