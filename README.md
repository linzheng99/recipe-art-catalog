# Recipe Art Catalog

一个 Q 版菜谱插画图鉴，将熟悉的家常菜画成可爱的食物插画，支持浏览、搜索和下载。

目前收录 **194 张独立插画，覆盖 195 篇菜谱**，更多菜品持续补充中。

## 功能

- 按菜名、别称搜索，按分类浏览。
- 查看菜品大图、菜谱介绍、烹饪难度、食材用量、制作步骤及原菜谱来源。
- 下载 256 / 512 px 透明 WebP 图片。
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

## 来源

菜谱目录与引用文字来自 [Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)，遵循上游 Unlicense。插画由 AI 独立生成，没有使用上游照片。

各类内容的来源与许可范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
