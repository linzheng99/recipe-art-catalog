import { expect, it } from "vitest";
import { getDishURL } from "@/lib/dish-link";

it("菜品分享链接保留仓库子路径，去掉无关参数并定位图鉴", () => {
  expect(
    getDishURL(
      "tomato-egg",
      "https://owner.github.io/recipe-art-catalog/?utm_source=test#prompt",
    ),
  ).toBe("https://owner.github.io/recipe-art-catalog/?dish=tomato-egg#catalog");
  expect(
    getDishURL(
      "dish-a1b5c702a812",
      "http://127.0.0.1:4174/index.html?dish=old#source",
    ),
  ).toBe("http://127.0.0.1:4174/index.html?dish=dish-a1b5c702a812#catalog");
});
