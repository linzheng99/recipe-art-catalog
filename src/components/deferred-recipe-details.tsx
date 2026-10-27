import { Component, lazy, Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { safeExternalURL } from "@/lib/catalog";
import type { Artwork, ReferenceRecipe } from "@/lib/catalog";
import { recipeDetailsCacheKey } from "@/lib/recipe-details";
import { useCatalogStore } from "@/stores/catalog-store";

const LazyRecipeDetails = lazy(() =>
  import("@/components/recipe-details").then(({ RecipeDetails }) => ({
    default: RecipeDetails,
  })),
);

class RecipeCodeBoundary extends Component<
  { children: ReactNode; recipes: ReferenceRecipe[] },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="recipe-details space-y-4" role="alert">
        <p>菜谱内容暂时无法显示，请刷新页面重试。</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          刷新页面
        </Button>
        {this.props.recipes.map((recipe) => {
          const url = safeExternalURL(recipe.url, "github.com");
          return url ? (
            <p key={recipe.id}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                查看原菜谱：{recipe.name}
              </a>
            </p>
          ) : null;
        })}
      </div>
    );
  }
}

export function DeferredRecipeDetails({ item }: { item: Artwork }) {
  const cacheKey = recipeDetailsCacheKey(item);
  const state = useCatalogStore((store) => store.recipeDetails[cacheKey]);
  const load = useCatalogStore((store) => store.loadRecipeDetails);
  useEffect(() => {
    void load(item);
  }, [item, load]);
  const loading =
    Boolean(item.recipe_details) && (!state || state.status === "loading");
  return (
    <RecipeCodeBoundary key={cacheKey} recipes={item.reference_recipes}>
      <Suspense
        fallback={
          <p className="recipe-details" role="status">
            正在加载菜谱…
          </p>
        }
      >
        <LazyRecipeDetails
          recipes={state?.recipes ?? item.reference_recipes}
          loading={loading}
          error={state?.status === "error"}
          onRetry={() => void load(item)}
        />
      </Suspense>
    </RecipeCodeBoundary>
  );
}
