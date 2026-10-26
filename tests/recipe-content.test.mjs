import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseRecipeContent,
  loadRecipeContents,
} from "../scripts/recipe-content.mjs";
import { root } from "../scripts/build.mjs";

test("提取介绍与原文难度，保留嵌套步骤，不混入未定义基准的热量", () => {
  const parsed = parseRecipeContent(`# 示例菜的做法

![上游照片](./photo.jpg)

一道家常菜，从备料到出锅约需 15 分钟。

预估烹饪难度：★★
预估卡路里：252 大卡

## 必备原料和工具
- 鸡蛋

## 计算
- 鸡蛋 2 个

## 操作
1. 搅匀
   - 保持小火

### 火候提示
不要烧干。

\`\`\`text
## 这是代码，不是分节
\`\`\`

## 附加内容
可按口味调整。
如果您遵循本指南的制作流程而发现有问题或可以改进的流程，请提出 Issue 或 Pull request 。
`);
  assert.equal(parsed.introduction, "一道家常菜，从备料到出锅约需 15 分钟。");
  assert.equal(parsed.difficulty, "★★");
  assert.equal(parsed.sections.length, 4);
  assert.match(parsed.sections[2].markdown, /### 火候提示/);
  assert.match(parsed.sections[2].markdown, /## 这是代码，不是分节/);
  assert.match(parsed.sections[2].markdown, /   - 保持小火/);
  assert.equal(parsed.sections[3].markdown, "可按口味调整。");
  assert.equal(parseRecipeContent("# 无标注\n\n一段介绍。").difficulty, null);
});

test("195篇已配图菜谱均可从固定摘要原文读取，拒绝摘要不一致", async () => {
  const source = JSON.parse(
    await readFile(`${root}/catalog/howtocook.json`, "utf8"),
  );
  const config = JSON.parse(
    await readFile(`${root}/catalog/illustrations.json`, "utf8"),
  );
  const contents = await loadRecipeContents(root, source, config);
  const published = new Set(config.artworks.flatMap((item) => item.recipe_ids));
  assert.equal(contents.size, published.size);
  for (const content of contents.values()) {
    assert.ok(content.introduction);
    assert.ok(content.difficulty);
    assert.ok(content.sections.some((section) => section.heading === "操作"));
  }
  const invalid = structuredClone(source);
  const tomato = invalid.recipes.find(
    (item) => item.id === "howtocook-2130948c0fd2",
  );
  tomato.blob_sha = "0".repeat(40);
  await assert.rejects(
    () => loadRecipeContents(root, invalid, config),
    /原文摘要不一致/,
  );
});
