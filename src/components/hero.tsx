import { ArrowDownRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtworkImage } from "@/components/artwork-image";
import { useCatalogStore } from "@/stores/catalog-store";

const featured = ["tomato-egg", "mapo-tofu", "egg-fried-rice", "steamed-egg"];

export function Hero() {
  const catalog = useCatalogStore((state) => state.catalog);
  return (
    <section className="hero wrap" aria-labelledby="hero-title">
      <div>
        <p className="eyebrow">菜谱的另一种打开方式</p>
        <h1 id="hero-title">
          把每一道菜，<span>画得有滋有味。</span>
        </h1>
        <p className="hero-description">
          从家常小炒到一碗甜汤，把熟悉的味道收进一份 Q
          版插画图鉴。好看，也方便用起来。
        </p>
        <div className="actions">
          <Button size="lg" asChild>
            <a href="#catalog">
              逛逛菜谱图鉴
              <ArrowDownRight aria-hidden="true" />
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <a href="./manifest.json" download>
              <Download aria-hidden="true" />
              获取 JSON 目录
            </a>
          </Button>
        </div>
        <dl className="hero-stats" aria-label="实际制作进度">
          {[
            ["独立插画", catalog?.coverage.artworks],
            ["已配图菜谱", catalog?.coverage.recipes],
            ["继续绘制中", catalog?.coverage.pending],
          ].map(([label, count]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{count ?? "…"}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="hero-art" aria-label="精选菜品插画">
        {featured.map((key, index) => {
          const item = catalog?.artworks.find((artwork) => artwork.key === key);
          return (
            <div className={`art-tile tile-${index}`} key={key}>
              {item && <ArtworkImage item={item} eager />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
