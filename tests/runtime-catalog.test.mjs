import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRuntimeCatalog } from "../scripts/runtime-catalog.mjs";

const publicRoot = new URL("../public/", import.meta.url);

test("轻量目录保持全部图片与来源标识，正文可按摘要还原完整菜谱", async () => {
  const full = JSON.parse(await readFile(new URL("manifest.json", publicRoot)));
  const text = await readFile(new URL("manifest-lite.json", publicRoot));
  const lite = JSON.parse(text);
  assert.ok(text.length < 768 * 1024, "轻量目录必须保持在768KiB以内");
  assert.equal(lite.schema_version, 1);
  assert.equal(lite.version, full.version);
  assert.deepEqual(lite.coverage, full.coverage);
  assert.deepEqual(lite.recipes, full.recipes);
  for (const [index, item] of lite.artworks.entries()) {
    const original = full.artworks[index];
    const { generation, reference_recipes, ...fields } = original;
    const { recipe_details, search_terms, difficulty, ...summary } = item;
    assert.ok(
      search_terms.includes(
        item.name.normalize("NFKC").replace(/\s+/g, "").toLowerCase(),
      ),
    );
    assert.deepEqual(
      difficulty,
      [
        ...new Set(
          reference_recipes.map((recipe) => recipe.details.difficulty.length),
        ),
      ].sort(),
    );
    assert.deepEqual(summary, {
      ...fields,
      reference_recipes: reference_recipes.map(
        ({ details, ...source }) => source,
      ),
    });
    assert.equal(
      recipe_details.path,
      `assets/recipe-details/${item.key}.${recipe_details.sha256.slice(0, 16)}.json`,
    );
    const data = await readFile(new URL(recipe_details.path, publicRoot));
    assert.equal(data.length, recipe_details.bytes);
    assert.ok(data.length <= 64 * 1024, item.key);
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      recipe_details.sha256,
    );
    assert.deepEqual(JSON.parse(data), {
      schema_version: 1,
      key: item.key,
      reference_recipes,
    });
  }
});

test("派生轻量数据不改写完整目录，缺少正文时不生成虚假详情", () => {
  const manifest = {
    schema_version: 1,
    version: "example",
    artworks: [
      {
        key: "example",
        name: "示例",
        aliases: [],
        generation: { prompt: "Original evidence" },
        reference_recipes: [
          {
            id: "source",
            name: "示例",
            url: "https://example.com",
            details: null,
          },
        ],
      },
    ],
  };
  const before = structuredClone(manifest);
  const runtime = createRuntimeCatalog(manifest);
  assert.deepEqual(manifest, before);
  assert.deepEqual(runtime.details, []);
  assert.equal(runtime.index.artworks[0].recipe_details, undefined);
  assert.equal(runtime.index.artworks[0].generation, undefined);
});
