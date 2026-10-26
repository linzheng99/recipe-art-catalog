import { ArrowUpRight, Copy, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getManifestURL } from "@/lib/catalog";
import { copyAddress } from "@/lib/clipboard";

export function SiteInfo() {
  const manifestURL = getManifestURL().href;
  return (
    <>
      <section
        className="connect-section"
        id="connect"
        aria-labelledby="connect-title"
      >
        <div className="wrap connect-grid">
          <div>
            <p className="eyebrow">让插画走进你的项目</p>
            <h2 id="connect-title">
              一份 JSON，
              <br />
              连接整个图鉴。
            </h2>
            <p className="section-description">
              稳定的菜品标识、明确的别称、带摘要的图片路径。网站和应用都能独立接入。
            </p>
            <Button variant="link" asChild>
              <a href="./manifest.json">
                <FileJson aria-hidden="true" />
                查看完整目录
                <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </div>
          <div className="code-panel">
            <div className="code-header">
              <span>公开目录地址</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void copyAddress(manifestURL)}
              >
                <Copy aria-hidden="true" />
                复制地址
              </Button>
            </div>
            <code className="manifest-url">{manifestURL}</code>
            <pre>
              <code>{`const manifestURL = '你的目录地址'
const catalog = await fetch(manifestURL)
  .then(response => response.json())
const dish = catalog.artworks[0]
const imageURL = new URL(
  dish.variants['256'].path, manifestURL
).href`}</code>
            </pre>
            <p>提供透明 WebP · 256 / 512 px · 营养参考注明来源与基准</p>
          </div>
        </div>
      </section>
      <section
        className="source-section wrap"
        id="source"
        aria-labelledby="source-title"
      >
        <div>
          <p className="eyebrow">每一道菜，都有来处</p>
          <h2 id="source-title">灵感来自开源厨房。</h2>
        </div>
        <div className="source-copy">
          <p>
            菜谱目录与引用文字来自{" "}
            <a
              href="https://github.com/Anduin2017/HowToCook"
              target="_blank"
              rel="noopener noreferrer"
            >
              Anduin2017 / HowToCook
              <ArrowUpRight aria-hidden="true" />
            </a>
            ，遵循上游 Unlicense，并保留固定版本与逐篇来源。
          </p>
          <p>
            Q 版插画由 AI
            独立生成，没有下载或重用上游照片。图像用于菜品示意，营养参考不代表具体一餐的实际摄入。
          </p>
          <div className="source-links">
            <a href="./licenses/HOWTOCOOK-LICENSE.txt">
              查看上游许可证
              <ArrowUpRight aria-hidden="true" />
            </a>
            <a href="./THIRD_PARTY_NOTICES.md">
              来源与许可范围
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
