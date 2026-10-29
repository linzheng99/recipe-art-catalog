import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { NutritionPanel } from "@/components/nutrition-panel";
import { parseCatalog } from "@/lib/catalog";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../public/manifest-lite.json", import.meta.url),
    "utf8",
  ),
);
const catalog = parseCatalog(fixture);
const render = (item: (typeof catalog.artworks)[number]) =>
  renderToStaticMarkup(createElement(NutritionPanel, { item }));

it("同图两篇蒸蛋展示独立家庭份估算、人数与非实测说明", () => {
  const item = catalog.artworks.find((item) => item.key === "steamed-egg")!;
  const html = render(item);
  expect(html.match(/<section/g)).toHaveLength(2);
  expect(html).toContain("每100g可食部分 · 蒸水蛋");
  expect(html).toContain("每100g可食部分 · 鸡蛋羹");
  expect(html.match(/2–3人家庭份估算/g)).toHaveLength(2);
  expect(html).toContain("整份成品重量假设为360g");
  expect(html).toContain("整份成品重量假设为350g");
  expect(html).toContain("约 59.6 kcal / 100 g");
  expect(html).toContain("约 70.2 kcal / 100 g");
  expect(html).toContain("未做烹饪损失校正");
});

it("展示四项每100g值，估算标记和默认假设只出现一次", () => {
  const item = catalog.artworks.find(
    (item) => item.key === "dish-d051be3bc11e",
  )!;
  const html = render(item);
  for (const label of [
    "热量",
    "蛋白质",
    "碳水化合物",
    "脂肪",
    "每100g可食部分",
    "约 51.5 kcal / 100 g",
    "0.80 g",
    "12.63 g",
    "0.18 g",
  ])
    expect(html).toContain(label);
  expect(html).toContain("处理后的红熟番茄净可食量200g");
  expect(html.match(/<section/g)).toHaveLength(1);
});

it("热量缺失时仍显示其他已知项，真实0和暂无数据分别展示", () => {
  const item = structuredClone(
    catalog.artworks.find((item) => item.key === "dish-853f4dcc16af")!,
  );
  item.nutrition.per_100g = {
    energy_kcal: null,
    protein_g: 3.41,
    carbohydrate_g: null,
    fat_g: 0,
  };
  const html = render(item);
  expect(html).toContain("3.41 g");
  expect(html).toContain("0.00 g");
  expect(html.match(/暂无数据/g)).toHaveLength(2);
  expect(html).not.toContain("暂缺可靠数据");
  expect(html).toContain("营养参考来源");
});

it("仅展示已批准的限定方案，保留未适用默认值和完整空态", () => {
  const item = structuredClone(
    catalog.artworks.find((item) => item.key === "dish-7a681fba9fd0")!,
  );
  const html = render(item);
  expect(html).toContain("暂无通用默认参考");
  expect(html).toContain("营养参考（限定做法）");
  expect(html).toContain("155 kcal / 100 g");
  expect(html).toContain("流心主分支不适用");
  item.nutrition_profiles![0].review_status = "pending";
  const pending = render(item);
  expect(pending).toContain("暂缺可靠数据");
  expect(pending).not.toContain("155 kcal");
});

it("兼容旧目录，拒绝不属于当前菜谱的营养方案、无来源数值或无效审核状态", () => {
  const old = structuredClone(fixture);
  old.artworks.forEach(
    (item: Record<string, unknown>) => delete item.nutrition_profiles,
  );
  expect(parseCatalog(old).schema_version).toBe(1);
  const bad = structuredClone(fixture),
    egg = bad.artworks.find(
      (item: { key: string }) => item.key === "dish-7a681fba9fd0",
    );
  egg.nutrition_profiles[0].recipe_id = "wrong-recipe";
  expect(() => parseCatalog(bad)).toThrow(/nutrition profile/);
  egg.nutrition_profiles[0].recipe_id = egg.reference_recipes[0].id;
  egg.nutrition_profiles[0].source = null;
  expect(() => parseCatalog(bad)).toThrow(/nutrition reference/);
});
