# Recipe Art Catalog

一份独立的 **Q 版菜谱插画图鉴**，提供可浏览的网站、透明 WebP 图片和可导出的 JSON 目录。适合菜谱网站、饮食记录、食物展示等项目接入，不依赖任何业务应用或后端服务。

菜谱目录与引用文字来自 [Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)，使用固定版本 `0e106eea348c734fe1586f781202994439cf98a5`，遵循上游 **Unlicense** 并保留[原始许可证全文](catalog/HOWTOCOOK-LICENSE)。Q 版插画由 AI 独立生成，未下载或重用上游照片；来源与各类内容的许可范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

当前 **194 张插画覆盖 195 道菜谱**，另有 **177 道待生成**、1 篇模板排除。进度以 [catalog/COVERAGE.md](catalog/COVERAGE.md) 为准。

## 本地运行

需要 Node.js 22.14+。先用锁文件安装依赖；运行与构建现有网站不需要 Python 或数据库。

```sh
npm ci            # 按 package-lock.json 安装依赖
npm run dev       # http://127.0.0.1:4174，Vite 开发与热更新
npm run build     # 校验数据/图片、检查类型，Vite 生成 dist/
npm test          # 构建后运行目录、状态管理及网站仓库子路径测试
npm run check     # 检查格式、类型与已提交目录，不修改文件
npm run preview   # 预览 dist/，先执行 build
```

更换端口：`PORT=4175 npm run dev`。模拟 GitHub Pages 的仓库子目录：

```sh
BASE_PATH=/recipe-art-catalog/ npm run preview
# 打开 http://localhost:4174/recipe-art-catalog/
```

网站包含菜品搜索、分类筛选、大图详情、256/512px 下载、图片/目录地址复制、逐篇来源与营养参考。支持手机宽度、键盘操作、系统深色模式和减少动画偏好。请通过本地服务访问，不直接双击 HTML。

## 技术栈与前端规范

网站使用 **React + TypeScript + Vite**，构建产物仍是静态 HTML/CSS/JavaScript，可直接放在 GitHub Pages 或其他静态托管上。

| 职责 | 统一选型 | 当前使用 |
| --- | --- | --- |
| 页面与类型 | React 19、TypeScript 严格模式 | 页面按业务组件拆分 |
| 构建 | Vite 8 | 热更新、资源摘要、相对部署路径 |
| UI | shadcn/ui Nova，Radix 基础组件，Tailwind CSS 4 | 按钮、输入框、弹窗、标签、骨架与统一主题令牌 |
| 图标 | lucide-react | 搜索、下载、复制、外链、主题与空态 |
| 动画 | Motion | 卡片反馈、弹窗、提示和加载骨架；尊重减少动画偏好 |
| 共享状态 | Zustand | 目录请求、搜索、分类、分页、详情、主题与提示 |
| 普通布局 | CSS Grid / Flexbox | 桌面与手机响应式页面 |
| 可调整分栏 | react-resizable-panels | 当前无此需求，后续按需引入 |
| 拖拽 | dnd-kit | 当前无此需求，后续按需引入 |
| 质量检查 | TypeScript、Prettier、node:test、Vitest、Playwright | 类型、格式、目录一致性、状态与浏览器行为 |

基础 UI 集中在 `src/components/ui/`，通过 `components.json` 固定 `radix-nova` 预设和 Lucide 图标。后续添加基础组件运行 `npx shadcn add <组件名>`，业务代码复用这些组件；动画统一走 Motion，不另加自定义 CSS 关键帧或其他动画库。布局样式使用 `src/layout.css`，主题令牌使用 `src/index.css`；不在业务组件里各自实现按钮和弹窗。

`src/lib/catalog.ts` 定义前端类型、运行时目录校验和资源 URL；`src/stores/catalog-store.ts` 管理共享状态，组件使用 selector 订阅所需字段。外部 JSON 校验通过后才进入页面，未知营养值继续保留 null。公开 `manifest.json` 的 schema、稳定 key 和图片地址与原版兼容。

开发时运行 `npm run format` 统一格式。浏览器回归测试使用构建后的站点，并模拟 `/recipe-art-catalog/` 子目录：

```sh
npm run build
npx playwright install chromium   # 首次使用安装测试浏览器
npm run test:e2e                  # 桌面与手机视口
```

本机已有 Google Chrome 时也可使用 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`。测试覆盖搜索/别称、分类、加载更多、键盘打开详情/Escape/焦点恢复、下载、空态、错误重试、图片回退、深色模式和窄屏溢出。

## 部署到 GitHub Pages

已经提供 [.github/workflows/pages.yml](.github/workflows/pages.yml)，采用 GitHub 官方的构建产物部署方式，无需额外托管服务器。

1. 在 GitHub 创建仓库，将本项目作为**独立仓库根目录**提交并推送。目录名/仓库名可以继续调整，相对资源路径无需跟着重写。
2. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
3. 推送默认分支或在 **Actions → Validate and deploy GitHub Pages → Run workflow** 选择默认分支运行。其他分支和 PR 只校验，不发布。
4. 工作流按锁文件安装依赖，检查格式/类型/目录、构建 dist、运行数据与桌面/手机浏览器测试，然后上传并发布 GitHub Pages。成功后在 Pages 设置或 Actions 的 github-pages 环境中查看真实网址。

以仓库名 recipe-art-catalog 为例，上线后的地址结构是：

```text
官网：https://<账号>.github.io/recipe-art-catalog/
目录：https://<账号>.github.io/recipe-art-catalog/manifest.json
图片：https://<账号>.github.io/recipe-art-catalog/assets/food-artwork/<摘要文件名>.webp
```

这里的账号和仓库名是占位符；本地准备完成不代表已经上线。GitHub Pages 的实际开通资格、设置和限制以 [GitHub 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)为准。

也可把 dist 的**内容**上传到其他静态托管或对象存储，保留相对目录结构即可。GitHub Pages 不支持在仓库文件中任意设置 HTTP 缓存头；迁到可配置 CDN 时，建议图片一年 immutable，JSON短缓存并支持 ETag。

## 公开 JSON 接入

直接请求公开的 `manifest.json`，不要请求 GitHub 仓库 HTML 或 `/blob/` 页面，不在客户端放 GitHub token。任何前端或后端都可以读取同一数据。

```js
const manifestURL = "https://<账号>.github.io/recipe-art-catalog/manifest.json";
const catalog = await fetch(manifestURL).then((response) => response.json());
const artwork = catalog.artworks.find((item) =>
  [item.name, ...item.aliases].includes("番茄炒蛋"),
);
if (artwork) {
  const imageURL = new URL(artwork.variants["256"].path, manifestURL).href;
}
```

公开 GitHub 仓库还可直接使用 Raw 地址：`https://raw.githubusercontent.com/<账号>/<仓库>/<分支>/public/manifest.json`。资源路径统一为相对路径，`new URL(path, manifestURL)` 会保留 Pages 仓库前缀或 Raw 分支/public前缀，不能在路径前额外加 `/`。

消费方应自行做缓存和失败回退：定期刷新目录、保留最近有效版本、按需请求小图。发布时**先上传图片，再更新清单，并保留旧摘要文件**；不能因更新目录使已有客户端缓存的图片地址404。

### 数据字段

入口的 `schema_version=1`；`version` 为确定性内容摘要，元数据变化时变化。`coverage` 表示实际完成数，`recipes` 保留完整目录及 `ready/pending/excluded` 状态，`artworks` 只包含已发布插画。

| 字段                          | 用途                                   |
| ----------------------------- | -------------------------------------- |
| `key`                         | 稳定标识，域名/仓库改名不改变它        |
| `name / aliases`              | 标准菜名和明确别称，不模糊合并不同做法 |
| `category / recipe_ids`       | 上游分类与稳定菜谱ID                   |
| `reference_recipes`           | 每篇源网址、名称、分类和 blob SHA      |
| `illustration_only`           | 恒为 true，标记为示意插画              |
| `variants.256 / variants.512` | 路径、宽高、字节数、完整 SHA256        |
| `nutrition`                   | 状态、每100g基准、适用范围和来源版本   |

营养结构示例：

```json
{
  "status": "unknown",
  "basis": null,
  "serving_g": null,
  "scope": null,
  "per_100g": {
    "energy_kcal": null,
    "protein_g": null,
    "carbohydrate_g": null,
    "fat_g": null
  },
  "source": null
}
```

有可靠参考时，在 `catalog/nutrition.json` 的 entries 中按 key 填入 `status=reference`、`basis=per_100g`，并注明适用范围、来源网址/版本。构建会校验数值非负且来源完整。当前仅水煮玉米附有 USDA 黄色甜玉米可食粒参考（不含芯、不适用于糯玉米）；其余菜品缺少可靠数据，保持 null。

**未知不是零，参考不等于实际摄入。** 菜谱用量、烹饪出成率、生熟重量、配方和过敏信息需要消费方单独核实；图片不能作为营养依据。

## 目录与维护

| 路径                         | 内容                                 | Git 管理                         |
| ---------------------------- | ------------------------------------ | -------------------------------- |
| `src/`                       | React 页面、Nova 组件、样式、状态与数据逻辑 | 提交 |
| `index.html`                 | Vite 页面入口                       | 提交 |
| `public/`                    | JSON、压缩图及公开来源说明           | 提交；JSON/许可副本由 build 生成 |
| `catalog/illustrations.json` | key、菜名/别称、来源ID、原稿相对路径 | 提交                             |
| `catalog/variants.json`      | 衍生尺寸、摘要、字节数和原稿摘要     | 提交，Python生成                 |
| `catalog/nutrition.json`     | 经审阅的营养参考                     | 提交                             |
| `catalog/howtocook.json`     | 上游固定版本、分类、网址和blob SHA   | 提交                             |
| `sources/prompts/`           | 完整提示词、pending队列和检查点      | 提交，保留历史原文               |
| `sources/references/`        | 经固定blob SHA校验的文字食谱         | 提交，保留上游许可               |
| `sources/artwork/`           | PNG原稿与审核图，原稿约334MB         | 忽略Git，本机归档、另行备份      |
| `sources/fallbacks/`         | 六张原始画风参考                     | 忽略Git，本机归档、另行备份      |
| `dist/`                      | 可直接部署的静态站点                 | 忽略Git，CI构建                  |

普通 Git 检出安装 npm 依赖后，即使不含 PNG 原稿也可以独立构建、预览、测试和发布现有成品。继续制作需要恢复原稿归档；不要把 Git 当作忽略文件的备份。

### 继续生成与压缩

仅制作新图片时额外需要 Python 和 Pillow：

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/food-artwork/requirements.txt
```

1. 从 COVERAGE 和 `sources/prompts/HOWTOCOOK_FOOD_REMAINDER.json` 选择没有原稿的 pending 项，阅读对应文字食谱，不重复生成 approved 项。
2. 按统一深蓝轮廓、圆润Q版食材、浅蓝边餐具和真实透明规范逐菜生成独立 PNG。用 `.venv/bin/python scripts/food-artwork/save_generated.py <key> <结果PNG路径>` 保存原稿和独立检查点，脚本本身不调用生成API。
3. `.venv/bin/python scripts/food-artwork/review.py sheet --limit 24` 生成大图/44px预览，人工检查后执行 `.venv/bin/python scripts/food-artwork/review.py publish sources/artwork/reviews/<摘要>.json`。
4. `.venv/bin/python scripts/food-artwork/build.py` 压图，再运行 `npm run build && npm test && npm run check`，审阅差异后发布。

Pillow12.3.0、Lanczos与固定WebP编码；256px限制24KiB、512px限制64KiB。核对原稿和实际衍生摘要后增量复用，压图不改变已有成品URL，不自动删除旧图。

更新上游目录需显式提供固定 GitHub tree JSON：`python3 scripts/food-artwork/import_howtocook.py --tree /path/to/tree.json`；从对应本地稀疏检出用 `fetch_sources.py --source-repo /path/to/checkout` 导入文字并校验 blob SHA。不会下载网站照片、自动生成或审核图片。

新对话从 [AGENTS.md](AGENTS.md) 和本 README 开始即可独立维护。许可证与来源边界以 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 为准。
