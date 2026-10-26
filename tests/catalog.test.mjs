import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assemble, build, root } from "../scripts/build.mjs";
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
