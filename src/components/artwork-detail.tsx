import { Copy, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArtworkImage } from "@/components/artwork-image";
import { RecipeDetails } from "@/components/recipe-details";
import { categories, imageURL, safeExternalURL } from "@/lib/catalog";
import { copyAddress } from "@/lib/clipboard";
import type { Artwork } from "@/lib/catalog";

export function ArtworkDetail({
  item,
  restoreFocus,
}: {
  item: Artwork;
  restoreFocus: () => void;
}) {
  const nutrition = item.nutrition;
  const energy = nutrition.per_100g.energy_kcal;
  const known =
    nutrition.status === "reference" &&
    nutrition.basis === "per_100g" &&
    energy !== null;
  const nutritionURL = safeExternalURL(nutrition.source?.url);
  return (
    <DialogContent
      className="artwork-dialog flex flex-col overflow-hidden w-[calc(100%-2rem)] sm:max-w-[900px] p-5 sm:p-7"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        restoreFocus();
      }}
    >
      <DialogHeader className="shrink-0">
        <DialogTitle className="text-2xl font-semibold">
          {item.name}
        </DialogTitle>
        <DialogDescription>
          独立生成的菜品示意插画，提供透明 WebP 下载与逐篇来源。
        </DialogDescription>
      </DialogHeader>
      <div className="detail-scroll">
        <div className="detail-layout">
          <div className="detail-preview">
            <ArtworkImage key={item.key} item={item} size="512" eager />
          </div>
          <div className="detail-copy">
            <Badge variant="secondary">
              {categories[item.category] ?? item.category}
            </Badge>
            {item.aliases.length > 0 && (
              <p className="detail-aliases">也叫：{item.aliases.join("、")}</p>
            )}
            <dl className="detail-specs">
              <div>
                <dt>图片规格</dt>
                <dd>256 / 512 px · 透明 WebP</dd>
              </div>
              <div>
                <dt>营养参考</dt>
                <dd>{known ? `${energy} kcal / 100 g` : "暂缺可靠数据"}</dd>
              </div>
            </dl>
            {known && <p className="detail-scope">{nutrition.scope}</p>}
            <div className="detail-downloads">
              {(["256", "512"] as const).map((size) => (
                <Button
                  key={size}
                  variant={size === "256" ? "default" : "outline"}
                  asChild
                >
                  <a
                    href={imageURL(item, size)}
                    download={`${item.key}.${size}.webp`}
                  >
                    <Download aria-hidden="true" />
                    下载 {size} px ·{" "}
                    {Math.ceil(item.variants[size].bytes / 1024)} KB
                  </a>
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              onClick={() => void copyAddress(imageURL(item, "256"))}
            >
              <Copy aria-hidden="true" />
              复制图片地址
            </Button>
            <div className="detail-sources">
              {known && nutritionURL && (
                <a
                  href={nutritionURL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  营养参考来源
                  <ExternalLink aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
        <RecipeDetails recipes={item.reference_recipes} />
      </div>
    </DialogContent>
  );
}
