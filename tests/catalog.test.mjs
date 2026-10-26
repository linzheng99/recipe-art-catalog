import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assemble, build, root } from "../scripts/build.mjs";
import {
  collectGenerationPrompts,
  loadGenerationPrompts,
} from "../scripts/generation-prompts.mjs";
const json = async (name) =>
  JSON.parse(await readFile(`${root}/catalog/${name}.json`, "utf8"));
test("所有发布文件存在且摘要、尺寸预算和覆盖数据一致", async () => {
  const manifest = await build({ check: true });
  assert.equal(manifest.coverage.artworks, manifest.artworks.length);
  assert.equal(
    manifest.coverage.recipes +
      manifest.coverage.pending +
      manifest.coverage.excluded_templates,
    manifest.recipes.length,
  );
  assert.ok(manifest.coverage.artworks >= 194);
  for (const artwork of manifest.artworks) {
    for (const recipe of artwork.reference_recipes)
      assert.ok(recipe.details?.introduction, recipe.id);
    const url = new URL(
      artwork.variants["256"].path,
      "https://owner.github.io/repo/manifest.json",
    );
    assert.ok(
      url.href.startsWith("https://owner.github.io/repo/assets/food-artwork/"),
    );
  }
});
test("拒绝别名冲突和无来源营养数据；未知值保持null", async () => {
  const [source, config, variants, nutrition] = await Promise.all(
    ["howtocook", "illustrations", "variants", "nutrition"].map(json),
  );
  const duplicate = structuredClone(config);
  duplicate.artworks[1].aliases.push(config.artworks[0].name);
  assert.throws(
    () => assemble(source, duplicate, variants, nutrition),
    /别名冲突/,
  );
  const invalid = structuredClone(nutrition);
  invalid.entries[config.artworks[0].key] = {
    status: "reference",
    basis: "per_100g",
    per_100g: {
      energy_kcal: 100,
      protein_g: null,
      carbohydrate_g: null,
      fat_g: null,
    },
    source: null,
  };
  assert.throws(() => assemble(source, config, variants, invalid), /来源版本/);
  const manifest = assemble(source, config, variants, nutrition);
  assert.equal(
    manifest.artworks.find((a) => a.key === "tomato-egg").nutrition.per_100g
      .energy_kcal,
    null,
  );
  assert.ok(
    manifest.artworks
      .find((a) => a.key === "dish-853f4dcc16af")
      .nutrition.source.url.includes("169999"),
  );
});

test("已发布插画的生成与修正提示词保留归档原文，图片地址保持稳定", async () => {
  const [source, config, variants, nutrition, prompts] = await Promise.all([
    ...["howtocook", "illustrations", "variants", "nutrition"].map(json),
    loadGenerationPrompts(root),
  ]);
  const manifest = assemble(source, config, variants, nutrition, prompts);
  for (const artwork of manifest.artworks) {
    const generation = artwork.generation;
    assert.ok(generation?.prompt, artwork.key);
    const archive = JSON.parse(
      await readFile(`${root}/${generation.source_file}`, "utf8"),
    );
    const original = archive.artworks.find(
      (entry) => entry.key === artwork.key,
    );
    assert.equal(generation.prompt, original.prompt);
    assert.deepEqual(generation.correction, original.correction ?? null);
    assert.deepEqual(
      artwork.variants,
      variants.artworks.find((entry) => entry.key === artwork.key).variants,
    );
  }
  assert.ok(
    manifest.artworks.find((item) => item.key === "sweet-sour-pork").generation
      .correction,
  );
  assert.equal(manifest.schema_version, 1);
});

test("不凭空补写缺失 prompt，拒绝重复或不完整的归档记录", () => {
  const data = {
    tool: "image_gen",
    style_reference: "reference.png",
    artworks: [{ key: "example", prompt: "Original prompt" }],
  };
  const document = { source_file: "sources/prompts/example.json", data };
  assert.equal(
    collectGenerationPrompts([document]).get("missing") ?? null,
    null,
  );
  assert.throws(() => collectGenerationPrompts([document, document]), /重复/);
  const invalid = structuredClone(document);
  invalid.data.artworks[0].prompt = " ";
  assert.throws(() => collectGenerationPrompts([invalid]), /不完整/);
});
