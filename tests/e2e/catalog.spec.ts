import { test, expect } from "@playwright/test";

test("搜索、分类、键盘详情、下载和主题在仓库子路径可用", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(
    page.getByRole("status").filter({ hasText: "194 道菜品" }),
  ).toBeVisible();
  const cards = page.getByRole("button", { name: /^查看.+插画详情$/ });
  await expect(cards).toHaveCount(24);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("home.png") });
  await page.getByRole("button", { name: "再看看更多菜品" }).click();
  await expect(cards).toHaveCount(48);
  await page.getByRole("button", { name: "清爽素菜", exact: true }).click();
  expect(await cards.count()).toBeGreaterThan(0);
  expect(await cards.count()).toBeLessThanOrEqual(24);
  await page.getByRole("button", { name: "全部菜品", exact: true }).click();
  const search = page.getByRole("searchbox");
  await search.fill("番茄炒蛋");
  const card = page.getByRole("button", { name: "查看西红柿炒鸡蛋插画详情" });
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "西红柿炒鸡蛋" }),
  ).toBeVisible();
  const image = dialog.getByRole("img", { name: "西红柿炒鸡蛋" });
  await expect(image).toHaveJSProperty("naturalWidth", 512);
  await page.screenshot({ path: testInfo.outputPath("detail.png") });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("link", { name: /下载 256 px/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("tomato-egg.256.webp");
  expect(await download.failure()).toBeNull();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
  await search.fill("不存在的菜品xyz");
  await expect(
    page.getByText("暂时没有找到这道菜，试试别称或其他分类吧。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(cards).toHaveCount(24);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath("dark.png") });
  await page.getByRole("button", { name: "浅色外观" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("目录失败可重试，图片失败有可读回退", async ({ page }) => {
  let attempts = 0;
  await page.route("**/manifest.json", async (route) => {
    attempts += 1;
    if (attempts === 1)
      await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.route("**/tomato-egg.*.webp", (route) => route.abort());
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("图鉴暂时没有打开");
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByRole("searchbox")).toBeEnabled();
  await page.getByRole("searchbox").fill("番茄炒蛋");
  await expect(
    page
      .getByRole("button", { name: "查看西红柿炒鸡蛋插画详情" })
      .getByRole("img", { name: "西红柿炒鸡蛋（图片暂未加载）" }),
  ).toBeVisible();
});
