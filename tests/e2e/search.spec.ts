import { test, expect } from "@playwright/test";

test("全拼、首字母、常用别称与关键词搜索，组合筛选后可键盘重置", async ({
  page,
}, testInfo) => {
  const details: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/recipe-details/")) details.push(request.url());
  });
  await page.goto("./#catalog");
  const search = page.getByRole("searchbox");
  const tomato = page.getByRole("button", { name: "查看西红柿炒鸡蛋插画详情" });
  for (const query of [
    "xi hong shi chao ji dan",
    "XHSCJD",
    "fqcd",
    "番茄 鸡蛋",
  ]) {
    await search.fill(query);
    await expect(tomato).toBeVisible();
  }
  await page
    .getByRole("group", { name: "菜品分类" })
    .getByRole("button", { name: "清爽素菜" })
    .click();
  const levels = page.getByRole("group", { name: "烹饪难度" });
  await levels.getByRole("button", { name: "2 星", exact: true }).click();
  await expect(tomato).toBeVisible();
  expect(details).toEqual([]);
  await page
    .locator("#catalog")
    .screenshot({ path: testInfo.outputPath("search-filters.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await levels.getByRole("button", { name: "5 星", exact: true }).click();
  await expect(
    page.getByText("暂时没有找到这道菜，试试别称或其他分类吧。"),
  ).toBeVisible();
  const reset = page.getByRole("button", { name: "清除筛选", exact: true });
  await reset.focus();
  await page.keyboard.press("Enter");
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(
    levels.getByRole("button", { name: "全部难度" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: /^查看.+插画详情$/ }),
  ).toHaveCount(24);
  await search.fill("马铃薯丝");
  await expect(
    page.getByRole("button", { name: "查看酸辣土豆丝插画详情" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重置筛选" }).click();
  await expect(search).toHaveValue("");
});
