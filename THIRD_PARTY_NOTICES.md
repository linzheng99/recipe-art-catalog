# 来源与许可范围

## HowToCook 菜谱资料

- 来源仓库：[Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)。
- 采用版本：`0e106eea348c734fe1586f781202994439cf98a5`。
- 上游许可证：[Unlicense](https://github.com/Anduin2017/HowToCook/blob/0e106eea348c734fe1586f781202994439cf98a5/LICENSE)。
- 原始许可证全文保留于本仓库 `catalog/HOWTOCOOK-LICENSE`，网站副本位于 `licenses/HOWTOCOOK-LICENSE.txt`。
- 菜谱目录与归档的引用文字按该版本的上游许可使用；每篇的来源网址、固定版本及 Git blob SHA 保存在 catalog/howtocook.json，公开 JSON 中也保留逐篇来源。

本项目独立维护，与上游 HowToCook 无隶属或官方合作关系。没有下载、复用或热链上游照片。

## 独立插画与项目代码

Q 版插画由 AI 独立生成，以菜谱文字作为外观参考；插画不是 HowToCook 原照片，也不是用户实拍。上游 Unlicense 不因此自动覆盖独立插画和本项目新增代码。本项目尚未为这些新增内容另行指定统一许可证；公开展示不应被理解为已取得其他内容的相同授权。后续若统一开放复用，需要维护者明确许可范围。

## 营养参考

已有营养参考按其字段中的来源网址、数据标识和版本追溯，例如 USDA FoodData Central。这里的营养值只对应注明的基准及适用范围；未知值保留 null，不将示意图或配方参考当成实际摄入或过敏安全结论。

## 前端第三方代码与字体

网站使用 React / React DOM、Zustand、Motion、Radix UI、shadcn/ui Nova、Lucide、class-variance-authority、cn 等开源前端代码，并通过 Tailwind CSS 构建样式。确切版本及依赖关系保存在 package-lock.json；它们各自的许可不改变本项目独立插画或新增代码的许可范围。

`src/components/ui/` 的基础组件来源于 shadcn/ui 的 radix-nova 注册表，按 MIT 许可使用；弹窗文案与 Motion 动画在本地适配。Geist 字体通过 @fontsource-variable/geist 本地打包，按 SIL Open Font License 1.1 使用，不请求远程字体服务。

构建脚本将运行时依赖（含传递依赖）、shadcn/ui、Tailwind CSS 与 tw-animate-css 的原始许可证汇总为 `public/licenses/FRONTEND-DEPENDENCIES.txt`，随站点发布到 `licenses/FRONTEND-DEPENDENCIES.txt`，包含原始版权声明与 MIT、ISC、Apache、OFL 等实际文本。依赖更新后须重新构建并保留更新后的汇总。

react-remove-scroll-bar 的 npm 包未附许可证文件，单独保留的原文位于 `licenses/react-remove-scroll-bar-LICENSE.txt`，取自上游 [LICENSE](https://github.com/theKashey/react-remove-scroll-bar/blob/master/LICENSE)，并纳入上述汇总。
