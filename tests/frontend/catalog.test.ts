import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterArtworks, imageURL, parseCatalog } from "@/lib/catalog";
import { useCatalogStore } from "@/stores/catalog-store";

const fixture = JSON.parse(
  readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8"),
);
const liteFixture = JSON.parse(
  readFileSync(
    new URL("../../public/manifest-lite.json", import.meta.url),
    "utf8",
  ),
);

beforeEach(() => {
  useCatalogStore.setState(useCatalogStore.getInitialState(), true);
  vi.stubGlobal("window", {
    location: { href: "https://owner.github.io/recipe-art-catalog/" },
  });
});

describe("公开目录兼容性", () => {
  it("兼容未附正文的旧来源记录，拒绝损坏的菜谱分节", () => {
    const legacy = structuredClone(fixture);
    legacy.artworks.forEach(
      (item: { reference_recipes: Record<string, unknown>[] }) =>
        item.reference_recipes.forEach((recipe) => delete recipe.details),
    );
    expect(parseCatalog(legacy).schema_version).toBe(1);
    const invalid = structuredClone(fixture);
    invalid.artworks[0].reference_recipes[0].details.sections = [null];
    expect(() => parseCatalog(invalid)).toThrow(/recipe content/);
  });
  it("兼容没有 prompt 的旧目录，并拒绝无法显示的 prompt 字段", () => {
    const legacy = structuredClone(fixture);
    legacy.artworks.forEach(
      (item: Record<string, unknown>) => delete item.generation,
    );
    expect(parseCatalog(legacy).schema_version).toBe(1);
    const invalid = structuredClone(fixture);
    invalid.artworks[0].generation = { prompt: 123 };
    expect(() => parseCatalog(invalid)).toThrow(/generation prompt/);
  });
  it("按别称搜索，保留仓库子目录和旧图片摘要地址", () => {
    const catalog = parseCatalog(fixture);
    const tomato = catalog.artworks.find((item) => item.key === "tomato-egg")!;
    const term = tomato.aliases[0] ?? tomato.name;
    expect(filterArtworks(catalog.artworks, ` ${term} `, "all")).toContain(
      tomato,
    );
    expect(filterArtworks([tomato], term, "drink")).toEqual([]);
    expect(imageURL(tomato, "512")).toBe(
      `https://owner.github.io/recipe-art-catalog/${tomato.variants["512"].path}`,
    );
  });

  it("拒绝损坏的路径、未知 schema 和缺少来源的营养数值", () => {
    const invalid = structuredClone(fixture);
    invalid.artworks[0].variants["256"].path =
      "https://example.com/tracking.webp";
    expect(() => parseCatalog(invalid)).toThrow(/variant/);
    expect(() => parseCatalog({ ...fixture, schema_version: 2 })).toThrow(
      /Unsupported/,
    );
    const nutrition = structuredClone(fixture);
    nutrition.artworks[0].nutrition.per_100g.energy_kcal = 100;
    nutrition.artworks[0].nutrition.source = null;
    expect(() => parseCatalog(nutrition)).toThrow(/nutrition/);
  });
  it("全拼、首字母、常用别称和多个关键词可组合分类与难度", () => {
    const artworks = parseCatalog(liteFixture).artworks;
    for (const query of [
      "xi hong shi chao ji dan",
      "ＸＨＳＣＪＤ",
      "fqcd",
      "番茄 鸡蛋",
    ])
      expect(
        filterArtworks(artworks, query, "vegetable_dish", "2").map(
          (item) => item.key,
        ),
      ).toContain("tomato-egg");
    expect(
      filterArtworks(artworks, "马铃薯丝", "all").map((item) => item.key),
    ).toContain("shredded-potato");
    expect(filterArtworks(artworks, "xihongshichaojidan", "drink")).toEqual([]);
    expect(filterArtworks(artworks, "xihongshichaojidan", "all", "5")).toEqual(
      [],
    );
  });
  it("旧目录用正文难度筛选，缺少难度不猜测；完整名称排在包含结果之前", () => {
    const tomato = parseCatalog(fixture).artworks.find(
      (item) => item.key === "tomato-egg",
    )!;
    expect(filterArtworks([tomato], "", "all", "2")).toEqual([tomato]);
    const unknown = { ...tomato, reference_recipes: [] };
    expect(filterArtworks([unknown], "", "all", "1")).toEqual([]);
    const extended = { ...tomato, name: `${tomato.name}面`, aliases: [] };
    expect(filterArtworks([extended, tomato], tomato.name, "all")).toEqual([
      tomato,
      extended,
    ]);
    const multi = { ...tomato, difficulty: [1, 3] };
    expect(filterArtworks([multi], "", "all", "3")).toEqual([multi]);
  });
  it("拒绝无效的可选搜索索引和难度摘要", () => {
    const invalid = structuredClone(liteFixture);
    invalid.artworks[0].search_terms = [123];
    expect(() => parseCatalog(invalid)).toThrow(/search terms/);
    invalid.artworks[0].search_terms = ["番茄"];
    invalid.artworks[0].difficulty = [6];
    expect(() => parseCatalog(invalid)).toThrow(/difficulty/);
  });
});

describe("目录请求与筛选状态", () => {
  it("合并重复请求，HTTP 失败后可重试并恢复完整目录", async () => {
    let finish!: (value: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture)));
    vi.stubGlobal("fetch", fetchMock);
    const first = useCatalogStore.getState().load();
    await useCatalogStore.getState().load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(new Response("unavailable", { status: 503 }));
    await first;
    expect(useCatalogStore.getState().status).toBe("error");
    await useCatalogStore.getState().load();
    expect(useCatalogStore.getState().status).toBe("ready");
    expect(useCatalogStore.getState().catalog?.artworks).toHaveLength(
      fixture.coverage.artworks,
    );
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.href).toBe(
      "https://owner.github.io/recipe-art-catalog/manifest-lite.json",
    );
  });

  it("加载中遇到网络异常或无效 JSON 后进入可重试错误态", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(new Response("broken json")),
    );
    await useCatalogStore.getState().load();
    expect(useCatalogStore.getState().status).toBe("error");
    await useCatalogStore.getState().load();
    expect(useCatalogStore.getState().status).toBe("error");
    expect(useCatalogStore.getState().catalog).toBeNull();
  });

  it("切换搜索或分类后从首批展示，主题操作不改变筛选", () => {
    useCatalogStore.getState().showMore();
    expect(useCatalogStore.getState().shown).toBe(48);
    useCatalogStore.getState().setQuery("番茄");
    expect(useCatalogStore.getState().shown).toBe(24);
    useCatalogStore.getState().showMore();
    useCatalogStore.getState().setCategory("vegetable_dish");
    useCatalogStore.getState().showMore();
    useCatalogStore.getState().setDifficulty("2");
    useCatalogStore.getState().setTheme("dark");
    expect(useCatalogStore.getState()).toMatchObject({
      shown: 24,
      query: "番茄",
      category: "vegetable_dish",
      difficulty: "2",
      theme: "dark",
    });
    useCatalogStore.getState().resetFilters();
    expect(useCatalogStore.getState()).toMatchObject({
      query: "",
      category: "all",
      difficulty: "all",
      shown: 24,
    });
  });
});
