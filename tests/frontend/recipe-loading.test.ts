import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { parseCatalog } from "@/lib/catalog";
import type { Artwork } from "@/lib/catalog";
import {
  fetchRecipeDetails,
  parseRecipeDetails,
  recipeDetailsCacheKey,
} from "@/lib/recipe-details";
import { useCatalogStore } from "@/stores/catalog-store";

const rawLite = JSON.parse(
  readFileSync(
    new URL("../../public/manifest-lite.json", import.meta.url),
    "utf8",
  ),
);
const lite = parseCatalog(rawLite);
const tomato = lite.artworks.find((item) => item.key === "tomato-egg")!;
const tofu = lite.artworks.find((item) => item.key === "mapo-tofu")!;
const body = (item: Artwork) =>
  readFileSync(
    new URL(`../../public/${item.recipe_details!.path}`, import.meta.url),
    "utf8",
  );

beforeEach(() => {
  useCatalogStore.setState(useCatalogStore.getInitialState(), true);
  vi.stubGlobal("window", {
    location: { href: "https://owner.github.io/recipe-art-catalog/#catalog" },
  });
});

it("轻量目录缺失时兼容旧完整目录，临时故障不会自动下载大目录", async () => {
  const full = readFileSync(
    new URL("../../public/manifest.json", import.meta.url),
    "utf8",
  );
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("missing", { status: 404 }))
    .mockResolvedValueOnce(new Response(full));
  vi.stubGlobal("fetch", fetchMock);
  await useCatalogStore.getState().load();
  expect(useCatalogStore.getState().status).toBe("ready");
  expect(fetchMock.mock.calls.map(([url]) => url.pathname)).toEqual([
    "/recipe-art-catalog/manifest-lite.json",
    "/recipe-art-catalog/manifest.json",
  ]);
});

it("拒绝轻量索引中的越界正文地址和与菜品不匹配的正文", () => {
  const invalid = structuredClone(rawLite);
  invalid.artworks[0].recipe_details.path = "https://example.com/tracker.json";
  expect(() => parseCatalog(invalid)).toThrow(/descriptor/);
  expect(() => parseRecipeDetails(JSON.parse(body(tofu)), tomato)).toThrow(
    /details/,
  );
  const wrongSource = JSON.parse(body(tomato));
  wrongSource.reference_recipes[0].id = "different-recipe";
  expect(() => parseRecipeDetails(wrongSource, tomato)).toThrow(
    /source mismatch/,
  );
});

it("正文按仓库子路径加载并校验大小、摘要，损坏内容不进入缓存", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(body(tomato)))
    .mockResolvedValueOnce(
      new Response(body(tomato).replace("西红柿", "假资料")),
    );
  vi.stubGlobal("fetch", fetchMock);
  const recipes = await fetchRecipeDetails(tomato);
  expect(recipes[0].details?.introduction).toContain("一道酸甜开胃");
  expect(fetchMock.mock.calls[0][0].href).toBe(
    `https://owner.github.io/recipe-art-catalog/${tomato.recipe_details!.path}`,
  );
  await expect(fetchRecipeDetails(tomato)).rejects.toThrow(/digest mismatch/);
});

it("重复打开复用已校验正文，HTTP失败可显式重试", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(body(tomato)));
  vi.stubGlobal("fetch", fetchMock);
  const key = recipeDetailsCacheKey(tomato);
  await useCatalogStore.getState().loadRecipeDetails(tomato);
  expect(useCatalogStore.getState().recipeDetails[key].status).toBe("error");
  await useCatalogStore.getState().loadRecipeDetails(tomato);
  await useCatalogStore.getState().loadRecipeDetails(tomato);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(useCatalogStore.getState().recipeDetails[key].status).toBe("ready");
});

it("合并重复请求，快速切菜及同菜新版本不会串用正文", async () => {
  let finish!: (response: Response) => void;
  const changed = JSON.parse(body(tomato));
  changed.reference_recipes[0].details.introduction = "新版介绍";
  const updatedBody = JSON.stringify(changed);
  const sha256 = createHash("sha256").update(updatedBody).digest("hex");
  const updated = {
    ...tomato,
    recipe_details: {
      path: `assets/recipe-details/${tomato.key}.${sha256.slice(0, 16)}.json`,
      bytes: Buffer.byteLength(updatedBody),
      sha256,
    },
  };
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(new Response(body(tofu)))
    .mockResolvedValueOnce(new Response(updatedBody));
  vi.stubGlobal("fetch", fetchMock);
  const oldRequest = useCatalogStore.getState().loadRecipeDetails(tomato);
  await useCatalogStore.getState().loadRecipeDetails(tomato);
  useCatalogStore.getState().select(tofu.key);
  await useCatalogStore.getState().loadRecipeDetails(tofu);
  await useCatalogStore.getState().loadRecipeDetails(updated);
  finish(new Response(body(tomato)));
  await oldRequest;
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(useCatalogStore.getState().selectedKey).toBe(tofu.key);
  expect(
    useCatalogStore.getState().recipeDetails[recipeDetailsCacheKey(updated)]
      .recipes?.[0].details?.introduction,
  ).toBe("新版介绍");
  expect(
    useCatalogStore.getState().recipeDetails[recipeDetailsCacheKey(tofu)]
      .recipes?.[0].name,
  ).toBe(tofu.reference_recipes[0].name);
});

it("营养完整范围随摘要验证后的菜谱加载，范围错误或配方错位拒绝", async () => {
  const { parseRecipeData } = await import("@/lib/recipe-details");
  const data = JSON.parse(body(tomato));
  const parsed = parseRecipeData(data, tomato);
  expect(parsed.nutrition?.scope).toContain("番茄400g");
  expect(tomato.nutrition.scope).not.toContain("番茄400g");
  const broken = structuredClone(data);
  broken.nutrition.per_100g.protein_g += 1;
  expect(() => parseRecipeData(broken, tomato)).toThrow(/mismatch/);
  const wrongRecipe = structuredClone(data);
  wrongRecipe.nutrition_profiles[0].recipe_id = "wrong-recipe";
  expect(() => parseRecipeData(wrongRecipe, tomato)).toThrow(/mismatch/);
});

it("旧玉米默认来源版本与新方案摘要兼容，但拒绝改动营养或来源", async () => {
  const { parseRecipeData } = await import("@/lib/recipe-details");
  const corn = lite.artworks.find((item) => item.key === "dish-853f4dcc16af")!;
  const data = JSON.parse(body(corn));
  const parsed = parseRecipeData(data, corn);
  expect(parsed.nutrition?.per_100g.energy_kcal).toBe(96);
  expect(parsed.nutrition_profiles?.[0].per_100g.energy_kcal).toBe(96);
  expect(data.nutrition.source.version).not.toBe(
    data.nutrition_profiles[0].source.version,
  );
  const altered = structuredClone(data);
  altered.nutrition_profiles[0].per_100g.protein_g += 1;
  expect(() => parseRecipeData(altered, corn)).toThrow(/mismatch/);
  const wrongSource = structuredClone(data);
  wrongSource.nutrition_profiles[0].source.url =
    "https://example.com/other-food";
  expect(() => parseRecipeData(wrongSource, corn)).toThrow(/mismatch/);
});
