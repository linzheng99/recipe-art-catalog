import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFrontendNotices } from "./frontend-notices.mjs";
import { loadGenerationPrompts } from "./generation-prompts.mjs";
import { loadRecipeContents } from "./recipe-content.mjs";

export const root = fileURLToPath(new URL("../", import.meta.url));
const readJSON = async (filename) =>
  JSON.parse(await readFile(path.join(root, filename), "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (name) => name.normalize("NFKC").replace(/\s+/g, "");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function assemble(
  source,
  config,
  variants,
  nutrition,
  prompts = new Map(),
  recipeContents = new Map(),
) {
  const recipes = new Map(source.recipes.map((recipe) => [recipe.id, recipe]));
  const images = new Map(variants.artworks.map((image) => [image.key, image]));
  const keys = new Set(),
    names = new Set(),
    covered = new Map();
  const artworks = config.artworks.map((artwork) => {
    assert(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artwork.key) && !keys.has(artwork.key),
      "非法或重复 key",
    );
    keys.add(artwork.key);
    for (const name of [artwork.name, ...artwork.aliases]) {
      assert(
        typeof name === "string" &&
          normalize(name) &&
          !names.has(normalize(name)),
        "空名字或别名冲突",
      );
      names.add(normalize(name));
    }
    assert(artwork.recipe_ids.length > 0, "缺少菜谱来源");
    const references = artwork.recipe_ids.map((id) => {
      const recipe = recipes.get(id);
      assert(
        recipe && recipe.category !== "template" && !covered.has(id),
        "菜谱ID缺失或重复覆盖",
      );
      covered.set(id, artwork.key);
      return recipe;
    });
    const image = images.get(artwork.key);
    assert(image?.variants, `缺少衍生图 ${artwork.key}，先运行 Python 压图`);
    const reference = nutrition.entries[artwork.key] ?? {
      status: "unknown",
      basis: null,
      serving_g: null,
      scope: null,
      per_100g: {
        energy_kcal: null,
        protein_g: null,
        carbohydrate_g: null,
        fat_g: null,
      },
      source: null,
    };
    assert(["unknown", "reference"].includes(reference.status), "营养状态错误");
    assert(
      reference.basis === null || reference.basis === "per_100g",
      "当前只支持每100克参考值",
    );
    for (const key of ["energy_kcal", "protein_g", "carbohydrate_g", "fat_g"]) {
      const value = reference.per_100g[key];
      assert(
        value === null || (Number.isFinite(value) && value >= 0),
        "非法营养值",
      );
      if (value !== null)
        assert(
          reference.status === "reference" &&
            reference.basis === "per_100g" &&
            reference.scope &&
            reference.source?.url &&
            reference.source?.version,
          "数值必须有基准、适用范围和来源版本",
        );
      if (reference.status === "unknown") assert(value === null, "未知不能填0");
    }
    return {
      key: artwork.key,
      name: artwork.name,
      aliases: artwork.aliases,
      category: references[0].category,
      recipe_ids: artwork.recipe_ids,
      illustration_only: true,
      reference_recipes: references.map(
        ({ id, name, category, source_url, blob_sha }) => ({
          id,
          name,
          category,
          url: source_url,
          blob_sha,
          details: recipeContents.get(id) ?? null,
        }),
      ),
      nutrition: reference,
      generation: prompts.get(artwork.key) ?? null,
      variants: image.variants,
    };
  });
  const catalog = {
    schema_version: 1,
    source: {
      name: source.source,
      commit: source.source_commit,
      url: source.dashboard_url,
      license: source.license,
      license_url: source.license_url,
    },
    image_usage: "菜品示意图，不是用户照片；配方、营养与过敏信息需单独核实。",
    coverage: {
      artworks: artworks.length,
      recipes: covered.size,
      pending: source.recipes.filter(
        (recipe) => recipe.category !== "template" && !covered.has(recipe.id),
      ).length,
      excluded_templates: source.recipes.filter(
        (recipe) => recipe.category === "template",
      ).length,
    },
    artworks,
    recipes: source.recipes.map(({ id, name, category, source_url }) => ({
      id,
      name,
      category,
      source_url,
      artwork_key: covered.get(id) ?? null,
      status: covered.has(id)
        ? "ready"
        : category === "template"
          ? "excluded"
          : "pending",
    })),
  };
  return {
    schema_version: 1,
    version: hash(JSON.stringify(catalog)).slice(0, 16),
    ...catalog,
  };
}

export async function build({ check = false } = {}) {
  await writeFrontendNotices(root, { check });
  const [source, config, variants, nutrition] = await Promise.all(
    [
      "catalog/howtocook.json",
      "catalog/illustrations.json",
      "catalog/variants.json",
      "catalog/nutrition.json",
    ].map(readJSON),
  );
  const prompts = await loadGenerationPrompts(root);
  const recipeContents = await loadRecipeContents(root, source, config);
  const manifest = assemble(
    source,
    config,
    variants,
    nutrition,
    prompts,
    recipeContents,
  );
  // Git checkout只需要压缩成品；不依赖未提交的PNG原稿、Python或其他应用仓库。
  for (const artwork of manifest.artworks) {
    for (const size of [256, 512]) {
      const variant = artwork.variants[String(size)];
      const expected = `assets/food-artwork/${artwork.key}.${variant?.sha256?.slice(0, 16)}.${size}.webp`;
      assert(
        variant?.path === expected && /^[a-f0-9]{64}$/.test(variant.sha256),
        "非法图片路径或摘要",
      );
      const data = await readFile(path.join(root, "public", expected));
      assert(
        variant.width === size &&
          variant.height === size &&
          data.length === variant.bytes &&
          data.length <= (size === 256 ? 24 : 64) * 1024 &&
          hash(data) === variant.sha256,
        `图片校验失败 ${expected}`,
      );
    }
  }
  // 来源文本与许可证同时进入公开站点，避免部署产物丢失上游声明。
  const publications = [
    ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
    ["catalog/HOWTOCOOK-LICENSE", "licenses/HOWTOCOOK-LICENSE.txt"],
  ];
  for (const [sourcePath, publishedPath] of publications) {
    const sourceText = await readFile(path.join(root, sourcePath), "utf8");
    const target = path.join(root, "public", publishedPath);
    if (check)
      assert(
        (await readFile(target, "utf8")) === sourceText,
        `来源副本过期 ${publishedPath}`,
      );
    else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, sourceText);
    }
  }
  const text = JSON.stringify(manifest, null, 2) + "\n";
  if (check)
    assert(
      (await readFile(path.join(root, "public/manifest.json"), "utf8")) ===
        text,
      "manifest过期，请运行 npm run build",
    );
  else {
    await writeFile(path.join(root, "public/manifest.json"), text);
    const lines = [
      "# 菜谱插画覆盖进度",
      "",
      `插画 ${manifest.coverage.artworks} 张，覆盖 ${manifest.coverage.recipes} 道菜，待生成 ${manifest.coverage.pending} 道。`,
      "",
      "| 菜名 | 分类 | 状态 | 来源 |",
      "| --- | --- | --- | --- |",
      ...manifest.recipes.map(
        (recipe) =>
          `| ${recipe.name.replaceAll("|", "／")} | ${recipe.category} | ${recipe.status} | [源文档](${recipe.source_url}) |`,
      ),
    ];
    await writeFile(
      path.join(root, "catalog/COVERAGE.md"),
      lines.join("\n") + "\n",
    );
  }
  console.log(
    `目录校验通过：${manifest.coverage.artworks}张图，${manifest.coverage.recipes}道菜，${Buffer.byteLength(text)}B JSON；version=${manifest.version}`,
  );
  return manifest;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await build({ check: process.argv.includes("--check") });
