import { useRef } from "react";
import { motion } from "motion/react";
import { ArrowDown, RefreshCw, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { ArtworkImage } from "@/components/artwork-image";
import { ArtworkDetail } from "@/components/artwork-detail";
import { categories, filterArtworks } from "@/lib/catalog";
import { useCatalogStore } from "@/stores/catalog-store";
import { useDishNavigation } from "@/hooks/use-dish-navigation";

export function CatalogSection() {
  const catalog = useCatalogStore((state) => state.catalog);
  const status = useCatalogStore((state) => state.status);
  const query = useCatalogStore((state) => state.query);
  const category = useCatalogStore((state) => state.category);
  const shown = useCatalogStore((state) => state.shown);
  const selectedKey = useCatalogStore((state) => state.selectedKey);
  const setQuery = useCatalogStore((state) => state.setQuery);
  const setCategory = useCatalogStore((state) => state.setCategory);
  const select = useDishNavigation();
  const showMore = useCatalogStore((state) => state.showMore);
  const load = useCatalogStore((state) => state.load);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const matches = filterArtworks(catalog?.artworks ?? [], query, category);
  const selected = catalog?.artworks.find((item) => item.key === selectedKey);
  const filters = [
    ["all", "全部菜品"],
    ...Object.entries(categories).filter(([key]) =>
      catalog?.artworks.some((item) => item.category === key),
    ),
  ];
  const loading = status === "idle" || status === "loading";

  return (
    <section
      className="catalog-section wrap"
      id="catalog"
      aria-labelledby="catalog-title"
    >
      <div className="section-heading">
        <p className="eyebrow">熟悉的味道，可爱的模样</p>
        <h2 id="catalog-title">今天，想看哪道菜？</h2>
        <p>点击插画，查看大图、来源与可用的图片规格。</p>
      </div>
      <div className="catalog-toolbar">
        <div className="search-field">
          <label className="sr-only" htmlFor="search">
            搜索菜名或别称
          </label>
          <Search aria-hidden="true" />
          <Input
            className="pl-10"
            ref={search}
            id="search"
            type="search"
            value={query}
            placeholder="搜搜看，比如：番茄炒蛋"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            disabled={status !== "ready"}
          />
        </div>
        <span className="result-count" role="status" aria-live="polite">
          {loading
            ? "正在打开图鉴…"
            : status === "error"
              ? "目录加载失败"
              : `${matches.length} 道菜品`}
        </span>
      </div>
      <div className="filters" role="group" aria-label="菜品分类">
        {catalog &&
          filters.map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={category === key ? "default" : "ghost"}
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
            >
              {label}
            </Button>
          ))}
      </div>
      {loading && (
        <div className="gallery" aria-label="正在读取插画目录" aria-busy="true">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index}>
              <Skeleton className="skeleton-image" />
              <Skeleton className="mt-4 h-4 w-24" />
            </div>
          ))}
        </div>
      )}
      {status === "error" && (
        <div className="catalog-message" role="alert">
          <RefreshCw aria-hidden="true" />
          <p>图鉴暂时没有打开，请检查网络后重试。</p>
          <Button variant="outline" onClick={() => void load()}>
            重新加载
          </Button>
        </div>
      )}
      {status === "ready" && matches.length === 0 && (
        <div className="catalog-message" role="status">
          <SearchX aria-hidden="true" />
          <p>暂时没有找到这道菜，试试别称或其他分类吧。</p>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setCategory("all");
              search.current?.focus();
            }}
          >
            清除筛选
          </Button>
        </div>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) select(null);
        }}
      >
        {status === "ready" && (
          <div className="gallery" aria-label="菜品插画">
            {matches.slice(0, shown).map((item) => (
              <motion.button
                key={item.key}
                type="button"
                className="food-card"
                aria-label={`查看${item.name}插画详情`}
                aria-haspopup="dialog"
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  select(item.key);
                }}
              >
                <span className="food-image">
                  <ArtworkImage item={item} />
                </span>
                <span className="food-caption">
                  <span className="food-name">{item.name}</span>
                  <Badge variant="secondary">
                    {categories[item.category] ?? item.category}
                  </Badge>
                </span>
              </motion.button>
            ))}
          </div>
        )}
        {selected && (
          <ArtworkDetail
            item={selected}
            restoreFocus={() =>
              (trigger.current?.isConnected
                ? trigger.current
                : search.current
              )?.focus()
            }
          />
        )}
      </Dialog>
      {status === "ready" && matches.length > shown && (
        <div className="load-more">
          <Button variant="outline" onClick={showMore}>
            再看看更多菜品
            <ArrowDown aria-hidden="true" />
          </Button>
        </div>
      )}
    </section>
  );
}
