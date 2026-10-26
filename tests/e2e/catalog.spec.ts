import { test, expect } from "@playwright/test";
import { COMMON_PROMPT } from "../../src/lib/prompt-template";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(
  readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8"),
);

test("搜索、分类、键盘详情、下载和主题在仓库子路径可用", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(
    page.getByRole("status").filter({
      hasText: `${fixture.artworks.length} 道菜品`,
    }),
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
    dialog.getByRole("heading", { name: "西红柿炒鸡蛋", level: 2 }),
  ).toBeVisible();
  const image = dialog.getByRole("img", { name: "西红柿炒鸡蛋" });
  await expect(image).toHaveJSProperty("naturalWidth", 512);
  const recipe = dialog.getByRole("region", {
    name: "西红柿炒鸡蛋",
    exact: true,
  });
  await expect(recipe).toContainText("一道酸甜开胃的家常菜肴");
  await expect(recipe.getByLabel("HowToCook 预估难度：2 星")).toBeVisible();
  await expect(
    recipe.getByRole("heading", { name: "食材与工具" }),
  ).toBeVisible();
  await expect(recipe.getByRole("heading", { name: "用量参考" })).toBeVisible();
  await expect(recipe.getByRole("heading", { name: "制作步骤" })).toBeVisible();
  await expect(recipe.getByText("西红柿洗净", { exact: true })).toBeVisible();
  await expect(dialog.locator("img")).toHaveCount(1);
  await recipe
    .getByRole("heading", { name: "西红柿炒鸡蛋", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("recipe-light.png") });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.screenshot({ path: testInfo.outputPath("recipe-dark.png") });
  await expect(
    dialog.getByRole("button", { name: "关闭详情" }),
  ).toBeInViewport();
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
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

test("蒸蛋的两篇原菜谱分别展示，旧目录缺少正文时仍可打开来源", async ({
  page,
}) => {
  await page.goto("./");
  const search = page.getByRole("searchbox");
  await expect(search).toBeEnabled();
  await search.fill("蒸水蛋");
  await page.getByRole("button", { name: "查看蒸水蛋插画详情" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("region", { name: "蒸水蛋", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "鸡蛋羹", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "查看原菜谱", exact: true }),
  ).toHaveCount(2);
  await page.keyboard.press("Escape");
  const legacy = structuredClone(fixture);
  legacy.artworks.forEach(
    (item: { reference_recipes: Record<string, unknown>[] }) =>
      item.reference_recipes.forEach((recipe) => delete recipe.details),
  );
  await page.route("**/manifest.json", (route) =>
    route.fulfill({ json: legacy }),
  );
  await page.reload();
  await expect(search).toBeEnabled();
  await search.fill("番茄炒蛋");
  await page.getByRole("button", { name: "查看西红柿炒鸡蛋插画详情" }).click();
  await expect(
    dialog.getByText("本站暂未收录这篇菜谱正文，可通过原菜谱链接查看。"),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "查看原菜谱", exact: true }),
  ).toHaveAttribute("href", /github.com\/Anduin2017\/HowToCook\/blob\//);
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

test("首页直接展示并复制公共 Prompt，详情中不再重复", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { copiedPrompt?: string }).copiedPrompt = text;
        },
      },
    });
  });
  await page.goto("./");
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "生成 Prompt" })
    .click();
  const section = page.getByRole("region", {
    name: "公共生成 Prompt",
    exact: true,
  });
  const prompt = section.getByLabel("公共生成 Prompt 模板", { exact: true });
  await expect(prompt).toHaveText(COMMON_PROMPT);
  expect(
    await prompt.evaluate(
      (element) => element.scrollHeight <= element.clientHeight,
    ),
  ).toBe(true);
  await section.getByRole("button", { name: "复制公共 Prompt" }).click();
  expect(
    await page.evaluate(
      () => (window as Window & { copiedPrompt?: string }).copiedPrompt,
    ),
  ).toBe(COMMON_PROMPT);
  await expect(
    page.getByRole("status").filter({ hasText: "Prompt 已复制" }),
  ).toBeVisible();
  expect(
    await section.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await section.screenshot({
    path: testInfo.outputPath("common-prompt-light.png"),
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({
    path: testInfo.outputPath("common-prompt-dark.png"),
  });
  await page.getByRole("searchbox").fill("糖醋里脊");
  await page.getByRole("button", { name: "查看糖醋里脊插画详情" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Prompt/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Prompt/ })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: /下载 256 px/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.route("**/manifest.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("图鉴暂时没有打开");
  await expect(prompt).toHaveText(COMMON_PROMPT);
  await expect(
    section.getByRole("button", { name: "复制公共 Prompt" }),
  ).toBeEnabled();
});
