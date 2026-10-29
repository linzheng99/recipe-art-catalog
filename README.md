# Recipe Art Catalog

一个 Q 版菜谱插画图鉴，提供透明插画下载、菜谱查阅和有来源的营养参考，也可作为其他应用的图片与数据源。

目前收录 **371 张独立插画，覆盖 372 篇菜谱**。

[在线浏览](https://linzheng99.github.io/recipe-art-catalog/)

## 功能

- **查找菜谱**：支持菜名、别称、拼音和首字母搜索，可组合分类与烹饪难度筛选。
- **查看做法**：展示菜品介绍、食材用量、制作步骤及原菜谱链接。
- **下载插画**：提供 256 / 512 px 透明 WebP，支持分享具体菜品、复制公共生成 Prompt。
- **查看营养**：展示每 100g 热量、蛋白质、碳水和脂肪，可按食用克数换算，并查看估算依据与来源。
- **跨设备使用**：适配手机浏览，支持键盘操作和深色模式。

## 本地运行

需要 Node.js 22.14 或更高版本。

```sh
npm ci
npm run dev
```

打开 [http://127.0.0.1:4174](http://127.0.0.1:4174)。

构建并预览：

```sh
npm run build
npm run preview
```

构建产物位于 `dist/`，可部署到 GitHub Pages 或其他静态托管平台。

## 数据接入

公开 JSON 随站点发布，无需 API Key。

| 文件                                                          | 用途                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [manifest-lite.json](public/manifest-lite.json)               | 推荐的图片目录，包含菜品标识、别名、搜索词、分类、图片地址及详情入口。    |
| [nutrition/index-lite.json](public/nutrition/index-lite.json) | 推荐的营养目录，按 `recipe_id` 提供营养值、适用条件、来源版本和详情入口。 |
| [manifest.json](public/manifest.json)                         | 完整图片目录，另含菜谱正文及历史生成 Prompt。                             |
| [nutrition/index.json](public/nutrition/index.json)           | 完整营养目录，另含方案列表及评估记录。                                    |

线上地址以站点根目录为基准，例如 [manifest-lite.json](https://linzheng99.github.io/recipe-art-catalog/manifest-lite.json)。图片及详情的相对路径使用 `new URL(path, manifestURL)` 解析。公开目录保持 `schema_version=1`，菜品 `key`、`recipe_ids` 和已有图片摘要地址保持稳定。

## 营养参考

372 篇菜谱均有参考方案：7 篇直接参考、365 篇配方估算，其中 21 篇使用同类食物代理。所有数值以 **每 100g 成品可食部分** 为基准，估算用量与成品重量假设可追溯，不代表实际摄入的精确营养。

Mealora 等应用推荐读取 `nutrition/index-lite.json`，按 `recipe_id` 查找 `recipes[].nutrition.per_100g`，无需拼接原始食材数据。营养匹配须独立核对做法和适用条件；默认方案为 `unknown` 时，可从 `nutrition_profiles` 选择适用方案，无法匹配时回退到其他来源。缺失营养素保留 `null`。

- [应用接入与回退示例](docs/MEALORA_INTEGRATION.md)
- [数据生成、审核与发布流程](docs/NUTRITION.md)
- [USDA Key 配置与调用工具](docs/USDA_CLIENT.md)
- [营养覆盖报告](catalog/NUTRITION_COVERAGE.md)

## 来源

菜谱资料来自 [Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)，遵循上游 Unlicense。插画由 AI 独立生成。

营养参考主要采用 USDA FoodData Central 公共领域（CC0）数据，部分食材补充日本文部科学省及韩国 RDA 官方食物成分表。本项目独立整理与估算，不是来源机构的官方产品。

各类内容的来源与许可范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 自由使用

任何人均可免费使用本项目的独立插画、新增代码、生成提示词和自行维护的目录内容，包括个人或商业用途，允许复制、修改和分发，无需另行申请。授权说明见 [LICENSE](LICENSE)；第三方内容继续遵循各自原有许可。
