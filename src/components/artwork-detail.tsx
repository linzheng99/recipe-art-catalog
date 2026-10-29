import { Copy, Download, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArtworkImage } from "@/components/artwork-image";
import { DeferredRecipeDetails } from "@/components/deferred-recipe-details";
import { NutritionPanel } from "@/components/nutrition-panel";
import { categories, imageURL } from "@/lib/catalog";
import { copyAddress, copyText } from "@/lib/clipboard";
import { getDishURL } from "@/lib/dish-link";
import type { Artwork } from "@/lib/catalog";
import { useCatalogStore } from "@/stores/catalog-store";
import { recipeDetailsCacheKey } from "@/lib/recipe-details";

export function ArtworkDetail({
  item,
  restoreFocus,
}: {
  item: Artwork;
  restoreFocus: () => void;
}) {
  const details = useCatalogStore(
    (state) => state.recipeDetails[recipeDetailsCacheKey(item)],
  );
  const nutritionItem =
    details?.status === "ready"
      ? {
          ...item,
          nutrition: details.nutrition ?? item.nutrition,
          nutrition_profiles:
            details.nutrition_profiles ?? item.nutrition_profiles,
        }
      : item;
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
            </dl>
            <NutritionPanel key={item.key} item={nutritionItem} />
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
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  void copyText(
                    getDishURL(item.key),
                    "菜品链接已复制",
                    "请复制这个菜品链接",
                  )
                }
              >
                <Link2 aria-hidden="true" />
                复制菜品链接
              </Button>
              <Button
                variant="ghost"
                onClick={() => void copyAddress(imageURL(item, "256"))}
              >
                <Copy aria-hidden="true" />
                复制图片地址
              </Button>
            </div>
          </div>
        </div>
        <DeferredRecipeDetails item={item} />
      </div>
    </DialogContent>
  );
}
