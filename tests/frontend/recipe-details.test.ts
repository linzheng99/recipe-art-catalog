import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RecipeDetails } from "@/components/recipe-details";
import type { ReferenceRecipe } from "@/lib/catalog";

it("菜谱 Markdown 保留表格与列表，禁用照片、原始HTML和不安全链接", () => {
  const recipe: ReferenceRecipe = {
    id: "example",
    name: "示例菜",
    url: "https://github.com/owner/repo/blob/fixed/dishes/example.md",
    details: {
      introduction: "一句介绍。",
      difficulty: "★★",
      sections: [
        {
          heading: "操作",
          markdown: `1. 第一步
   - 一个提示

| 食材 | 用量 |
| --- | --- |
| 鸡蛋 | 2个 |

![上游照片](https://example.com/photo.jpg)

<script>alert(1)</script>

[危险链接](javascript:alert(1))
[相关做法](./other.md)`,
        },
      ],
    },
  };
  const html = renderToStaticMarkup(
    createElement(RecipeDetails, { recipes: [recipe] }),
  );
  expect(html).toContain("<ol>");
  expect(html).toContain("<table>");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script");
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain(
    'href="https://github.com/owner/repo/blob/fixed/dishes/other.md"',
  );
});
