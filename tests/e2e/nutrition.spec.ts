import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../public/manifest-lite.json", import.meta.url),
    "utf8",
  ),
);

async function openEvidence(scope: Locator) {
  const summaries = scope.locator("details.nutrition-explanation > summary");
  await expect(summaries.first()).toBeVisible();
  for (const summary of await summaries.all()) {
    if (
      !(await summary.evaluate(
        (el) => (el.parentElement as HTMLDetailsElement).open,
      ))
    )
      await summary.click();
  }
}

for (const sample of [
  {
    key: "dish-eb849be42cbb",
    kcal: "82.8",
    scope: "巴沙鱼净肉350g以通用淡水鲈鱼肉代理",
    file: "fish-proxy",
  },
  {
    key: "dish-43027c68c000",
    kcal: "66.7",
    scope: "非厂家配方或检测比例",
    file: "jelly-proxy",
  },
]) {
  test(`同类食物估算展示代理范围和每100g数值：${sample.file}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({
      colorScheme: sample.file === "fish-proxy" ? "dark" : "light",
    });
    await page.goto(`./?dish=${sample.key}#catalog`);
    const panel = page
      .getByRole("dialog")
      .getByRole("region", { name: "营养参考（同类食物估算）" });
    await openEvidence(panel);
    await expect(
      panel.getByText(`约 ${sample.kcal} kcal / 100 g`, { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText(new RegExp(sample.scope))).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "营养参考来源" }),
    ).toHaveAttribute("href", /fdc\.nal\.usda\.gov/);
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: testInfo.outputPath(`${sample.file}.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("Mealora浏览器按原字段获取代理营养和精度标记，来源详情可按摘要加载", async ({
  page,
}) => {
  await page.goto("./");
  const result = await page.evaluate(async () => {
    const client = await import(
      new URL("nutrition/client.js", location.href).href
    );
    const loaded = await client.loadNutritionIndex(
      new URL("manifest-lite.json", location.href).href,
    );
    const found = client.findNutritionProfiles(loaded, {
      recipeId: "howtocook-eb849be42cbb",
    });
    const profile = found.candidates[0];
    const calculated = client.calculateNutrition(profile, 150, {
      confirmedProfileId: profile.id,
      acceptStandardRecipe: true,
      acceptAssumedWeight: true,
    });
    const detail = await client.loadNutritionDetails(loaded, profile);
    return {
      status: calculated.status,
      kcal: calculated.portion.nutrients.energy_kcal,
      level: calculated.estimation_level,
      detail: detail.status,
      quality: loaded.index.reference_quality,
    };
  });
  expect(result.status).toBe("available");
  expect(result.kcal).toBeCloseTo(124.1463165, 6);
  expect(result.level).toBe("food_group_proxy");
  expect(result.detail).toBe("available");
  expect(result.quality).toEqual({
    food_group_proxy: 21,
    other_available: 351,
  });
});

test("韩国黄鳝来源的营养估算在详情中展示并保留家庭份范围", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./?dish=dish-b9a1d9770073#catalog");
  const panel = page
    .getByRole("dialog")
    .getByRole("region", { name: "营养参考（配方估算）" });
  await openEvidence(panel);
  await expect(
    panel.getByText("约 154.8 kcal / 100 g", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/黄鳝去骨净肉400g/)).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "营养参考来源" }),
  ).toHaveAttribute(
    "href",
    "https://www.nics.go.kr/food/kfi/fct/fctIntro/list",
  );
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({
    path: testInfo.outputPath("swamp-eel-krda-nutrition.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("官方韭菜数据与USDA混合估算可展示，Mealora按原字段读取且保留两种来源", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./?dish=dish-cf76d9b00d1d#catalog");
  const panel = page
    .getByRole("dialog")
    .getByRole("region", { name: "营养参考（配方估算）" });
  await openEvidence(panel);
  await expect(
    panel.getByText("约 138.6 kcal / 100 g", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/韭菜净叶200g/)).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "营养参考来源" }),
  ).toHaveAttribute("href", /fooddb\.mext\.go\.jp.*06207/);
  const result = await page.evaluate(async () => {
    const client = await import(
      new URL("nutrition/client.js", location.href).href
    );
    const loaded = await client.loadNutritionIndex(
      new URL("manifest-lite.json", location.href).href,
    );
    const found = client.findNutritionProfiles(loaded, {
      recipeId: "howtocook-cf76d9b00d1d",
    });
    const profile = found.candidates[0];
    const intake = client.calculateNutrition(profile, 180, {
      confirmedProfileId: profile.id,
      acceptStandardRecipe: true,
      acceptAssumedWeight: true,
    });
    const details = await client.loadNutritionDetails(loaded, profile);
    return {
      status: intake.status,
      kcal: intake.portion.nutrients.energy_kcal,
      providers: profile.source.providers,
      foodIDs: profile.source.food_ids,
      details: details.status,
    };
  });
  expect(result.status).toBe("available");
  expect(result.kcal).toBeCloseTo(249.4, 5);
  expect(result.providers).toEqual(["mext", "usda"]);
  expect(result.foodIDs).toEqual([{ provider: "mext", id: "06207" }]);
  expect(result.details).toBe("available");
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({
    path: testInfo.outputPath("chive-mixed-nutrition.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("糖醋里脊显示家庭份估算和成品保留油，维持每100g基准", async ({
  page,
}, testInfo) => {
  await page.goto("./?dish=sweet-sour-pork#catalog");
  const dialog = page.getByRole("dialog");
  await openEvidence(dialog);
  const panel = dialog.getByRole("region", { name: "营养参考（配方估算）" });
  await openEvidence(panel);
  await expect(
    panel.getByText("约 179.2 kcal / 100 g", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(/食用油30g是估计炸后吸收及挂汁留在成品中的合计/),
  ).toBeVisible();
  await expect(panel.getByText(/不计油锅余油或未粘附粉浆/)).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "营养参考来源" }),
  ).toHaveAttribute("href", /168249/);
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({
    path: testInfo.outputPath("sweet-sour-pork-nutrition.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Mealora浏览器接入：读取每篇菜谱的汇总字段及150g营养，不需要USDA Key", async ({
  page,
}) => {
  await page.goto("./");
  const result = await page.evaluate(async () => {
    const clientURL = new URL("nutrition/client.js", location.href).href;
    const client = await import(clientURL);
    const loaded = await client.loadNutritionIndex(
      new URL("manifest-lite.json", location.href).href,
    );
    const found = client.findNutritionProfiles(loaded, {
      recipeId: "howtocook-b13f782654bf",
    });
    const profile = found.candidates[0];
    const intake = client.calculateNutrition(profile, 150, {
      confirmedProfileId: profile.id,
      acceptStandardRecipe: true,
      acceptAssumedWeight: true,
    });
    const details = await client.loadNutritionDetails(loaded, profile);
    return {
      status: intake.status,
      calories: intake.portion.nutrients.energy_kcal,
      projected: found.recipe.nutrition.per_100g,
      detailStatus: details.status,
    };
  });
  expect(result.status).toBe("available");
  expect(result.calories).toBeCloseTo(89.375, 5);
  expect(result.projected.energy_kcal).toBeCloseTo(59.583333, 5);
  expect(result.detailStatus).toBe("available");
});

test("同图蒸蛋按不同家庭份方案显示，保留每100g基准和非实测说明", async ({
  page,
}, testInfo) => {
  await page.goto("./?dish=steamed-egg#catalog");
  const dialog = page.getByRole("dialog");
  await openEvidence(dialog);
  const panels = dialog.getByRole("region", { name: "营养参考（配方估算）" });
  await expect(panels).toHaveCount(2);
  for (const [recipe, grams, energy] of [
    ["蒸水蛋", 360, "约 59.6 kcal / 100 g"],
    ["鸡蛋羹", 350, "约 70.2 kcal / 100 g"],
  ] as const) {
    const panel = panels.filter({
      has: page.getByText(`每100g可食部分 · ${recipe}`, { exact: true }),
    });
    await openEvidence(panel);
    await expect(panel.getByText(energy, { exact: true })).toBeVisible();
    await expect(
      panel.getByText(
        new RegExp(`2–3人家庭份估算.*整份成品重量假设为${grams}g.*非实测`),
      ),
    ).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "营养参考来源" }),
    ).toHaveAttribute("href", /171287/);
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({
      path: testInfo.outputPath(`${recipe}-family-nutrition.png`),
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("标准黄瓜及熟重燕麦展示完整营养和关键用量假设，米饭限定品种", async ({
  page,
}, testInfo) => {
  for (const [key, title, energy, scope] of [
    ["cucumber-salad", "凉拌黄瓜", "约 50.8 kcal / 100 g", /带皮黄瓜净200g/],
    [
      "dish-0f850528c984",
      "牛奶燕麦",
      "约 77.5 kcal / 100 g",
      /200g熟燕麦不声称等于原文40g干燕麦/,
    ],
  ] as const) {
    await page.goto(`./?dish=${key}#catalog`);
    const dialog = page.getByRole("dialog");
    await openEvidence(dialog);
    await expect(
      dialog.getByRole("heading", { name: title, exact: true, level: 2 }),
    ).toBeVisible();
    const panel = dialog.getByRole("region", { name: "营养参考（配方估算）" });
    await openEvidence(panel);
    await expect(panel.getByText(energy, { exact: true })).toBeVisible();
    await expect(panel.getByText(scope)).toBeVisible();
    for (const label of ["蛋白质", "碳水化合物", "脂肪"])
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({
      path: testInfo.outputPath(`${key}-nutrition.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("./?dish=dish-cf3dabc066de#catalog");
  const dialog = page.getByRole("dialog");
  await openEvidence(dialog);
  await expect(
    dialog.getByText("130 kcal / 100 g", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(/不适用于糯米、糙米、长粒米、粥或生米/),
  ).toBeVisible();
});

test("标准配方的营养显示约数、默认用量和估算标记，来源与下载仍可用", async ({
  page,
}, testInfo) => {
  await page.goto("./?dish=dish-d051be3bc11e#catalog");
  const dialog = page.getByRole("dialog");
  await openEvidence(dialog);
  await expect(
    dialog.getByRole("heading", { name: "糖拌西红柿", exact: true, level: 2 }),
  ).toBeVisible();
  await expect(
    dialog.getByText("营养参考（配方估算）", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("约 51.5 kcal / 100 g", { exact: true }),
  ).toBeVisible();
  for (const value of [
    "蛋白质",
    "碳水化合物",
    "脂肪",
    "0.80 g",
    "12.63 g",
    "0.18 g",
    "每100g可食部分",
  ])
    await expect(dialog.getByText(value, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(/标准配方估算：处理后的红熟番茄净可食量200g/),
  ).toBeVisible();
  await expect(dialog.getByRole("link", { name: /下载 256 px/ })).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "营养参考来源" }),
  ).toHaveAttribute("href", /170457/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const panel = dialog.getByRole("region", { name: "营养参考（配方估算）" });
  await openEvidence(panel);
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({
    path: testInfo.outputPath("tomato-sugar-estimate.png"),
  });
});

test("限定方案明确做法，部分已知不会被缺失热量隐藏，零不当成缺失", async ({
  page,
}) => {
  await page.goto("./?dish=dish-7a681fba9fd0#catalog");
  const dialog = page.getByRole("dialog");
  await openEvidence(dialog);
  await expect(
    dialog.getByText("暂无通用默认参考，以下数据仅适用于注明的做法。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("营养参考（限定做法）", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("155 kcal / 100 g", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/流心主分支不适用/)).toBeVisible();
  const partial = structuredClone(fixture);
  const corn = partial.artworks.find(
    (item: { key: string }) => item.key === "dish-853f4dcc16af",
  );
  corn.nutrition.per_100g = {
    energy_kcal: null,
    protein_g: 3.41,
    carbohydrate_g: null,
    fat_g: 0,
  };
  await page.route("**/manifest-lite.json", (route) =>
    route.fulfill({ json: partial }),
  );
  await page.goto("./?dish=dish-853f4dcc16af#catalog");
  await expect(dialog.getByText("3.41 g", { exact: true })).toBeVisible();
  await expect(dialog.getByText("0.00 g", { exact: true })).toBeVisible();
  await expect(dialog.getByText("暂无数据", { exact: true })).toHaveCount(2);
  await expect(dialog.getByText("暂缺可靠数据", { exact: true })).toHaveCount(
    0,
  );
});

test("品牌配方打开详情后还原完整范围，保留未知默认与独立来源", async ({
  page,
}, testInfo) => {
  const item = fixture.artworks.find(
    (row: { name: string }) => row.name === "皮蛋豆腐",
  );
  await page.goto(`./?dish=${item.key}#catalog`);
  const dialog = page.getByRole("dialog");
  await openEvidence(dialog);
  await expect(
    dialog.getByText("暂无通用默认参考，以下数据仅适用于注明的做法。", {
      exact: true,
    }),
  ).toBeVisible();
  const panel = dialog.getByRole("region", { name: "营养参考（配方估算）" });
  await openEvidence(panel);
  await expect(
    panel
      .locator(".detail-scope")
      .filter({ hasText: /限定品牌：.*WEI-CHUAN GTIN 072869351029/ }),
  ).toBeVisible();
  await expect(panel.getByText(/味全皮蛋净可食部分150g/)).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "营养参考来源" }),
  ).toHaveAttribute("href", /2442977/);
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({
    path: testInfo.outputPath("preserved-egg-tofu-nutrition.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("食用克数换算保留每100g基准，支持自定义、小数、错误恢复与键盘展开依据", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({
    colorScheme: testInfo.project.name === "mobile" ? "dark" : "light",
  });
  await page.goto("./?dish=tomato-egg#catalog");
  const dialog = page.getByRole("dialog");
  const panel = dialog.getByRole("region", { name: "营养参考（配方估算）" });
  await expect(
    panel.getByText("约 82.0 kcal / 100 g", { exact: true }),
  ).toBeVisible();
  const evidence = panel.locator("details");
  await expect(evidence).not.toHaveAttribute("open", "");
  await dialog.getByRole("button", { name: "150g", exact: true }).click();
  const portion = panel.getByLabel("150g营养参考", { exact: true });
  await expect(
    portion.getByText("约 123.0 kcal", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("约 82.0 kcal / 100 g", { exact: true }),
  ).toBeVisible();
  const amount = dialog.getByRole("spinbutton", { name: "食用量" });
  await amount.fill("62.5");
  await expect(
    panel
      .getByLabel("62.5g营养参考")
      .getByText("约 51.2 kcal", { exact: true }),
  ).toBeVisible();
  for (const bad of ["", "0", "-5"]) {
    await amount.fill(bad);
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("alert")).toContainText("有效克数");
    await expect(panel.locator(".nutrition-portion")).toHaveCount(0);
  }
  await dialog.getByRole("button", { name: "200g", exact: true }).click();
  await expect(amount).toHaveValue("200");
  await expect(amount).toHaveAttribute("aria-invalid", "false");
  await expect(
    panel
      .getByLabel("200g营养参考")
      .getByText("约 164.0 kcal", { exact: true }),
  ).toBeVisible();
  const summary = evidence.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(evidence).toHaveJSProperty("open", true);
  await expect(panel.getByText(/红熟番茄400g/)).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "完整营养依据（JSON）" }),
  ).toHaveAttribute("href", /^assets\/nutrition\//);
  await page.keyboard.press("Space");
  await expect(evidence).toHaveJSProperty("open", false);
  await expect(panel.getByText(/成品约500g（假设）/)).toBeVisible();
  await dialog.locator(".nutrition-amount").scrollIntoViewIfNeeded();
  await dialog.screenshot({
    path: testInfo.outputPath("nutrition-portion.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("同图两篇配方分别换算，切换菜品不沿用上一道的克数", async ({ page }) => {
  await page.goto("./?dish=steamed-egg#catalog");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("每100g可食部分 · 蒸水蛋", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "200g", exact: true }).click();
  const portions = dialog.getByLabel("200g营养参考", { exact: true });
  await expect(portions).toHaveCount(2);
  await expect(portions.nth(0)).toContainText("119.2 kcal");
  await expect(portions.nth(1)).toContainText("140.5 kcal");
  await page.goto("./?dish=tomato-egg#catalog");
  await expect(page.getByRole("spinbutton", { name: "食用量" })).toHaveValue(
    "100",
  );
});
