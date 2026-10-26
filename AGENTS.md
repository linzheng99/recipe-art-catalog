# Recipe Art Catalog 维护约定

这是可独立运行、构建和部署的菜谱插画项目。进入本仓库的新对话只以这里的代码和资料为基础，不要求访问其他应用仓库。

## 工程与交付

- 前端统一 React + TypeScript + Vite；UI 使用 shadcn/ui Nova（Radix 基础组件）和 Tailwind CSS，图标仅用 Lucide，动画使用 Motion，共享状态使用 Zustand。使用 package-lock.json 和 npm ci 固定依赖，不混用其他组件、图标、动画或状态库。
- 普通响应式布局使用 CSS Grid/Flex；需要用户调整分栏时统一 react-resizable-panels，需要拖拽排序时统一 dnd-kit。当前图鉴没有这两类交互，按需求引入，不为使用库增加功能。
- 保留纯静态部署、可直接发布 GitHub Pages 的 dist 输出及相对路径，不引入业务服务器或数据库。src/components/ui 放统一基础组件；业务组件放 src/components，数据逻辑放 src/lib，共享状态放 src/stores。
- 修改前阅读 README、THIRD_PARTY_NOTICES.md 和相关脚本。中文注释解释非直观逻辑；普通代码不机械加注释。
- 维护公开 schema_version=1；key、recipe_ids 和已有图片摘要地址稳定。新增字段可兼容追加，破坏性变更须新schema与迁移说明。
- 提交前 npm run build、npm test、npm run check；网站变化执行 npm run test:e2e，验证桌面/手机宽度、搜索/分类/详情/下载、空态/错误态、键盘与深色模式。GitHub Pages仓库子目录必须可用。
- 不擅自推送、创建远程仓库或部署。默认分支CI已配置，实际启用由用户在 GitHub 完成。

## 素材、来源与营养

- 当前194张独立插画覆盖195篇菜谱，177篇待生成，1篇模板不生成；以 catalog/COVERAGE.md 和 sources/prompts/HOWTOCOOK_FOOD_REMAINDER.json 为准，不将pending算作完成。
- HowToCook固定提交与上游Unlicense必须保留，更新目录前审阅差异；不得下载网站照片冒充独立插画。
- 原始生成提示词、审核记录与摘要属于历史证据，不因为项目更名而篡改。新提示词用通用菜谱图鉴语境。
- 统一深蓝轮廓、圆润Q版食材、浅蓝边餐具和真实透明背景；逐菜独立生成，不裁切整页图。查看原稿/44px预览后显式审核，再压图发布。
- sources/artwork和sources/fallbacks不进入普通Git，必须另行备份；不要删除唯一原稿。Git中的压缩图和目录足以构建网站。保存生图结果到原稿目录，不能只留工具缓存。
- 使用已确认的图片生成工具，费用或额度变化不能擅自切换收费API。发生限制保留检查点；先检查已有文件，避免重复生成。
- Python/Pillow12.3.0只供新图压缩/审核；256px<=24KiB，512px<=64KiB，文件SHA作为URL一部分。先上传新文件再更新清单，保留旧摘要文件。
- 营养以 per100g/适用范围/来源版本定义，缺少可靠数据保持null。不可凭示意图编造营养或把整锅数据当每100g；不保存用户健康资料。
- 许可范围见THIRD_PARTY_NOTICES.md，上游许可不自动等于独立插画/新增代码的许可，不替维护者假定新的授权。
