import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterArtworks, imageURL, parseCatalog } from "@/lib/catalog";
import { useCatalogStore } from "@/stores/catalog-store";

const fixture = JSON.parse(
  readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8"),
);

beforeEach(() => {
  useCatalogStore.setState(useCatalogStore.getInitialState(), true);
  vi.stubGlobal("window", {
    location: { href: "https://owner.github.io/recipe-art-catalog/" },
  });
});

describe("公开目录兼容性", () => {
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
    expect(() => parseCatalog(nutrition)).toThrow(/nutrition/);
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
      "https://owner.github.io/recipe-art-catalog/manifest.json",
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
    useCatalogStore.getState().setTheme("dark");
    expect(useCatalogStore.getState()).toMatchObject({
      shown: 24,
      query: "番茄",
      category: "vegetable_dish",
      theme: "dark",
    });
  });
});
