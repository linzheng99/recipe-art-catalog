import { create } from "zustand";
import { getCatalogURL, getManifestURL, parseCatalog } from "@/lib/catalog";
import type { Artwork, Catalog, ReferenceRecipe } from "@/lib/catalog";
import { fetchRecipeData, recipeDetailsCacheKey } from "@/lib/recipe-details";

export interface RecipeLoadState {
  status: "loading" | "ready" | "error";
  recipes: ReferenceRecipe[] | null;
  nutrition?: Artwork["nutrition"];
  nutrition_profiles?: Artwork["nutrition_profiles"];
}

interface CatalogState {
  catalog: Catalog | null;
  status: "idle" | "loading" | "ready" | "error";
  query: string;
  category: string;
  difficulty: string;
  shown: number;
  selectedKey: string | null;
  theme: "system" | "light" | "dark";
  notice: string | null;
  recipeDetails: Record<string, RecipeLoadState>;
  loadRecipeDetails: (item: Artwork) => Promise<void>;
  load: () => Promise<void>;
  setQuery: (query: string) => void;
  setCategory: (category: string) => void;
  setDifficulty: (difficulty: string) => void;
  resetFilters: () => void;
  showMore: () => void;
  select: (key: string | null) => void;
  setTheme: (theme: "system" | "light" | "dark") => void;
  notify: (notice: string | null) => void;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  catalog: null,
  status: "idle",
  query: "",
  category: "all",
  difficulty: "all",
  shown: 24,
  selectedKey: null,
  theme: "system",
  notice: null,
  recipeDetails: {},
  load: async () => {
    // 合并 StrictMode 与重复点击产生的加载；失败后仍可显式重试。
    if (get().status === "loading") return;
    set({ status: "loading", selectedKey: null });
    try {
      const options = () => ({
        signal: AbortSignal.timeout(10000),
        credentials: "omit" as const,
      });
      let response = await fetch(getCatalogURL(), options());
      // 旧部署没有轻量入口时继续兼容完整目录，其他错误保留显式重试。
      if (response.status === 404)
        response = await fetch(getManifestURL(), options());
      if (!response.ok) throw new Error("Catalog unavailable");
      const catalog = parseCatalog(await response.json());
      set({ catalog, status: "ready" });
    } catch {
      set({ status: "error", catalog: null });
    }
  },
  loadRecipeDetails: async (item) => {
    if (!item.recipe_details) return;
    const key = recipeDetailsCacheKey(item);
    const status = get().recipeDetails[key]?.status;
    if (status === "loading" || status === "ready") return;
    const update = (value: RecipeLoadState) =>
      set((state) => ({
        recipeDetails: { ...state.recipeDetails, [key]: value },
      }));
    update({ status: "loading", recipes: null });
    try {
      const data = await fetchRecipeData(item);
      // 以正文摘要隔离缓存；切换菜品或目录更新后，旧请求不会覆盖当前正文。
      update({ status: "ready", ...data });
    } catch {
      update({ status: "error", recipes: null });
    }
  },
  setQuery: (query) => set({ query, shown: 24 }),
  setCategory: (category) => set({ category, shown: 24 }),
  setDifficulty: (difficulty) => set({ difficulty, shown: 24 }),
  resetFilters: () =>
    set({ query: "", category: "all", difficulty: "all", shown: 24 }),
  showMore: () => set((state) => ({ shown: state.shown + 24 })),
  select: (selectedKey) => set({ selectedKey }),
  setTheme: (theme) => set({ theme }),
  notify: (notice) => set({ notice }),
}));
