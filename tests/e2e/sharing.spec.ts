import { test, expect } from "@playwright/test";

test("分享链接直达首批之外的菜品，刷新与复制后仍可打开，关闭不退出网站", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { copiedDishURL?: string }).copiedDishURL = value;
        },
      },
    });
  });
  await page.goto("./?utm_source=test&dish=dish-a1b5c702a812#catalog");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "鸡蛋花", level: 2 }),
  ).toBeVisible();
  await page.reload();
  await expect(
    dialog.getByRole("heading", { name: "鸡蛋花", level: 2 }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "复制菜品链接" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "菜品链接已复制" }),
  ).toBeVisible();
  const copied = await page.evaluate(
    () => (window as Window & { copiedDishURL?: string }).copiedDishURL,
  );
  const expected = new URL(page.url());
  expected.search = "?dish=dish-a1b5c702a812";
  expect(copied).toBe(expected.href);
  const historyLength = await page.evaluate(() => history.length);
  await dialog.getByRole("button", { name: "关闭详情" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(
    /\/recipe-art-catalog\/\?utm_source=test#catalog$/,
  );
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.goto(copied!);
  await expect(
    dialog.getByRole("heading", { name: "鸡蛋花", level: 2 }),
  ).toBeVisible();
  await expect(dialog.getByRole("img", { name: "鸡蛋花" })).toHaveJSProperty(
    "naturalWidth",
    512,
  );
});

test("点击卡片更新地址，前进后退和关闭详情保留原有筛选与焦点", async ({
  page,
}) => {
  await page.goto("./#catalog");
  const originalURL = page.url();
  const search = page.getByRole("searchbox");
  await expect(search).toBeEnabled();
  await search.fill("番茄炒蛋");
  const card = page.getByRole("button", { name: "查看西红柿炒鸡蛋插画详情" });
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\?dish=tomato-egg#catalog$/);
  await page.goBack();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(originalURL);
  await expect(search).toHaveValue("番茄炒蛋");
  await expect(card).toBeFocused();
  await page.goForward();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\?dish=tomato-egg#catalog$/);
  await dialog.getByRole("button", { name: "关闭详情" }).click();
  await expect(page).toHaveURL(originalURL);
  await expect(dialog).not.toBeVisible();
  await page.goForward();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(originalURL);
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
});

test("无效菜品链接提示并返回图鉴，仍可继续浏览", async ({ page }) => {
  await page.goto("./?dish=missing-dish#catalog");
  await expect(page.getByRole("searchbox")).toBeEnabled();
  await expect(
    page.getByRole("status").filter({ hasText: "没有找到分享的菜品" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page).toHaveURL(/\/recipe-art-catalog\/#catalog$/);
  await page.getByRole("searchbox").fill("番茄炒蛋");
  await page.getByRole("button", { name: "查看西红柿炒鸡蛋插画详情" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("目录加载失败时保留分享地址，重试后直接打开目标菜品", async ({ page }) => {
  let attempts = 0;
  await page.route("**/manifest-lite.json", async (route) => {
    attempts += 1;
    if (attempts === 1)
      await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.goto("./?dish=tomato-egg#catalog");
  await expect(page.getByRole("alert")).toContainText("图鉴暂时没有打开");
  await expect(page).toHaveURL(/\?dish=tomato-egg#catalog$/);
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "西红柿炒鸡蛋", level: 2 }),
  ).toBeVisible();
});
