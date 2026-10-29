# 来源与许可范围

## HowToCook 菜谱资料

- 来源仓库：[Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)。
- 采用版本：`0e106eea348c734fe1586f781202994439cf98a5`。
- 上游许可证：[Unlicense](https://github.com/Anduin2017/HowToCook/blob/0e106eea348c734fe1586f781202994439cf98a5/LICENSE)。
- 原始许可证全文保留于本仓库 `catalog/HOWTOCOOK-LICENSE`，网站副本位于 `licenses/HOWTOCOOK-LICENSE.txt`。
- 菜谱目录与归档的引用文字按该版本的上游许可使用；每篇的来源网址、固定版本及 Git blob SHA 保存在 catalog/howtocook.json，公开 JSON 中也保留逐篇来源。

本项目独立维护，与上游 HowToCook 无隶属或官方合作关系。没有下载、复用或热链上游照片。

## 独立插画与项目代码

Q 版插画由 AI 独立生成，以菜谱文字作为外观参考；插画不是 HowToCook 原照片，也不是用户实拍。

任何人均可免费使用本项目的独立插画、新增代码、生成提示词和自行维护的目录内容，包括个人或商业用途，允许复制、修改和分发，无需另行申请。完整授权见仓库根目录 LICENSE，网站副本位于 `licenses/PROJECT-REUSE.txt`。此授权由本项目维护者提供；HowToCook 菜谱资料、第三方代码和字体继续遵循各自原有许可，使用时保留其要求的许可与版权声明。

## 营养参考

已有营养参考按其字段中的来源网址、数据标识和版本追溯，例如 USDA FoodData Central。这里的营养值只对应注明的基准及适用范围；未知值保留 null，不将示意图或配方参考当成实际摄入或过敏安全结论。

营养原始资料来自 [USDA FoodData Central](https://fdc.nal.usda.gov/)。根据[官方 API Guide](https://fdc.nal.usda.gov/api-guide/)，其数据属于公共领域，按 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 发布。建议来源署名：U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov. 具体食物的数据类型、发布版本、FDC ID、获取日期与原始响应摘要另行保存。

本项目是独立整理的参考数据及配方估算工具，不是 USDA 官方产品，不代表 USDA 对匹配、计算或审核结果的认可。`Codex evidence review` 记录表示本项目的模型辅助证据核对，不表示 USDA 审核或已获人工签署。原始响应缓存在 `sources/nutrition/`；方案、评估和批次在 `catalog/nutrition/`。待核验候选不作为可用营养发布。

### 日本文部科学省食物成分表

新增部分食材来源：文部科学省《日本食品標準成分表（八訂）増補2023年》，采用2026年3月27日正误更新的[官方数据文件](https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx)。[官方利用与引用说明](https://www.mext.go.jp/a_menu/syokuhinseibun/)允许自由利用成分数据，并要求二次利用注明出处。署名：**出典：日本食品標準成分表（八訂）増補2023年（文部科学省）。本项目加工计算。**

官方原表与食品行快照保存在 `sources/nutrition/mext/`；公开详情保留食品编号、版本、获取日期、原始摘要、出处及加工说明。这部分不是USDA数据，不适用USDA的CC0说明，也不代表文部科学省审核或认可本项目配方。复制或再分发这些参考时保留对应出处；本项目自由使用授权不替代第三方来源要求。

### 韩国RDA年度食物成分数据库

补充来源：[농촌진흥청 국가표준식품성분 DB 10.4](https://www.nics.go.kr/food/kfi/fct/fctIntro/list)，使用官方年度Excel数据库。官方说明该Excel按KOGL第1类（署名）提供，区别于第2类（非商业）的书籍PDF。署名：**출처: 농촌진흥청 국가표준식품성분 DB 10.4. 本项目提取并计算，非韩国官方产品。**

原表、食品码、学名、原始来源标记、单元格、版本、获取日期及摘要保存在 `sources/nutrition/krda/` 和公开营养详情中。它不是USDA数据，不将其食品码标成FDC ID。家庭配方、同属物种代理及成品重量假设由本项目整理，不代表来源机构审核或认可。

## 前端第三方代码与字体

网站使用 React / React DOM、Zustand、Motion、Radix UI、shadcn/ui Nova、Lucide、class-variance-authority、cn、react-markdown、remark-gfm 等开源前端代码，并通过 Tailwind CSS 构建样式。确切版本及依赖关系保存在 package-lock.json；它们各自的许可不改变本项目独立插画或新增代码的许可范围。

`src/components/ui/` 的基础组件来源于 shadcn/ui 的 radix-nova 注册表，按 MIT 许可使用；弹窗文案与 Motion 动画在本地适配。Geist 字体通过 @fontsource-variable/geist 本地打包，按 SIL Open Font License 1.1 使用，不请求远程字体服务。

构建脚本将运行时依赖（含传递依赖）、shadcn/ui、Tailwind CSS 与 tw-animate-css 的原始许可证汇总为 `public/licenses/FRONTEND-DEPENDENCIES.txt`，随站点发布到 `licenses/FRONTEND-DEPENDENCIES.txt`，包含原始版权声明与 MIT、ISC、Apache、OFL 等实际文本。依赖更新后须重新构建并保留更新后的汇总。

react-remove-scroll-bar 的 npm 包未附许可证文件，单独保留的原文位于 `licenses/react-remove-scroll-bar-LICENSE.txt`，取自上游 [LICENSE](https://github.com/theKashey/react-remove-scroll-bar/blob/master/LICENSE)，并纳入上述汇总。

搜索词在构建时使用 [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 生成全拼和首字母，工具按 MIT 许可使用，确切版本见 package-lock.json，许可证同样纳入上述汇总；浏览器仅加载派生搜索词，不包含拼音词典或运行时代码。
