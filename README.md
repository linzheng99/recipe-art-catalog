# Recipe Art Catalog

一个 Q 版菜谱插画图鉴，将熟悉的家常菜画成可爱的食物插画，支持浏览、搜索和下载。

目前收录 **371 张独立插画，覆盖 372 篇菜谱**，全部可生成菜谱已完成配图。

## 功能

- 按菜名、常用别称、全拼或首字母搜索，支持空格分隔多个关键词，可组合分类与烹饪难度筛选。
- 查看菜品大图、菜谱介绍、烹饪难度、食材用量、制作步骤及原菜谱来源。
- 在详情查看每100g热量、蛋白质、碳水与脂肪，以及估算用量、适用做法和营养来源；缺失项单独保留未知。
- 下载 256 / 512 px 透明 WebP 图片。
- 在菜品详情复制分享链接，打开链接或刷新页面可直达对应菜品，支持浏览器前进和后退。
- 在首页查看并复制公共生成 Prompt，替换菜名与成品描述即可使用。
- 导出 JSON 目录，方便其他项目接入。
- 适配手机浏览，支持深色模式。

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

反复构建产生的未发布详情版本可先预览、再归档：

```sh
npm run clean:generated
npm run clean:generated -- --apply
```

仅归档当前清单未引用、Git未跟踪且内容摘要正确的详情JSON，备份保存在被Git忽略的 `.cache/generated-history/`，附原路径和摘要清单。当前引用、已跟踪的历史文件、图片及营养原始资料始终保留；清理前先构建最新目录。

## 数据接入

- `manifest-lite.json`：轻量目录，提供菜品标识、别名、来源、营养参考和图片地址，适合图片源接入。
- 轻量目录的 `search_terms` 为构建时生成的搜索词，`difficulty` 为原菜谱的星级数组（1–5）；多篇来源保留各自难度，未标注时为空数组。
- 每道菜的 `recipe_details.path` 指向按需加载的菜谱正文；相对路径以目录地址为基准，用 `new URL(path, manifestURL)` 解析。
- `manifest.json`：保留兼容的完整目录，包含菜谱正文及历史生成 Prompt。

两个目录保持 `schema_version=1`，使用相同的菜品 key、recipe_ids 和图片摘要地址。菜谱正文文件附有 SHA-256 与字节数；完整目录和轻量目录的 version 均对应同一份资料版本。

## 营养参考

原始营养数据任务保存在 [需求原文](docs/prompts/NUTRITION_TASK.md)。其他应用可复用 [USDA Key与调用工具](docs/USDA_CLIENT.md)，完成验证Key、候选检索、原始缓存、每100g解析与可食克数换算。

营养数据独立于图片匹配。`nutrition/index.json` 按 `recipe_id` 提供已审核方案、适用条件、来源版本和全部 372 篇菜谱的评估状态；待核验候选不会作为可用营养公开。没有通用默认参考时，原有 `nutrition` 继续为 `unknown`，可按 `nutrition_profiles` 选择符合具体配方的方案。

全部372篇均有可读取的参考方案（7篇限定条件直接参考、365篇配方估算）；其中新增21篇采用同类通用食物代理，页面明确展示“同类食物估算”，不代表原品牌或原食材实测。没有遗留候选待核验、请求失败或未评估条目。全部任务按每批24篇处理并复用食材缓存。家庭份估算明确用量、成品重量假设和未校正烹饪损失，不当作实测。实际进度见 [营养覆盖报告](catalog/NUTRITION_COVERAGE.md)。

Mealora等应用直接读取汇总后的 `nutrition/index.json`，按 `recipe_id` 查找后取 `recipes[].nutrition.per_100g`；不需要读取或拼接USDA原始缓存。详见 [Mealora接入示例](docs/MEALORA_INTEGRATION.md)和[营养生成与审核说明](docs/NUTRITION.md)。

推荐新接入使用 `nutrition/index-lite.json`：同样按 `recipes[].nutrition.per_100g` 读取，保留完整适用条件、代理标记、来源版本和详情摘要，省去重复方案及评估处理记录。多方案菜谱的默认值仍为unknown，备选位于 `nutrition_profiles`。客户端默认读取轻量入口，旧清单自动兼容完整入口。

USDA搜索响应和食品快照使用无损 `.json.gz` 缓存，原有逻辑 `.json` 路径仍能由工具读取。`npm run nutrition:compress` 预览，追加 `-- --apply` 压缩并生成原始字节与压缩文件的摘要清单；原始内容、获取日期与来源不变。

发布流程生成 `nutrition/changes.json` 和Actions作业摘要，记录本次营养方案变化；部署后自动核对线上JSON版本、覆盖和典型详情摘要。命令与更新策略见 [营养生成与审核说明](docs/NUTRITION.md)。

## 来源

菜谱目录与引用文字来自 [Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)，遵循上游 Unlicense。插画由 AI 独立生成，没有使用上游照片。

营养优先采用 USDA FoodData Central 公共领域（CC0）数据，部分食材补充日本文部科学省及韩国RDA官方食物成分表并保留出处。本项目独立整理与估算，不是来源机构的官方产品；各来源授权分别保留。

各类内容的来源与许可范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 自由使用

任何人均可免费使用本项目的独立插画、新增代码、生成提示词和自行维护的目录内容，包括个人或商业用途，允许复制、修改和分发，无需另行申请。授权说明见 [LICENSE](LICENSE)；第三方内容继续遵循各自原有许可。
