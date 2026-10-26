import { create } from "zustand";
import { getManifestURL, parseCatalog } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog";

interface CatalogState {
  catalog: Catalog | null;
  status: "idle" | "loading" | "ready" | "error";
  query: string;
  category: string;
  shown: number;
  selectedKey: string | null;
  theme: "system" | "light" | "dark";
  notice: string | null;
  load: () => Promise<void>;
  setQuery: (query: string) => void;
  setCategory: (category: string) => void;
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
  shown: 24,
  selectedKey: null,
  theme: "system",
  notice: null,
  load: async () => {
    // 合并 StrictMode 与重复点击产生的加载；失败后仍可显式重试。
    if (get().status === "loading") return;
    set({ status: "loading", selectedKey: null });
    try {
      const response = await fetch(getManifestURL(), {
        signal: AbortSignal.timeout(10000),
        credentials: "omit",
      });
      if (!response.ok) throw new Error("Catalog unavailable");
      const catalog = parseCatalog(await response.json());
      set({ catalog, status: "ready" });
    } catch {
      set({ status: "error", catalog: null });
    }
  },
  setQuery: (query) => set({ query, shown: 24 }),
  setCategory: (category) => set({ category, shown: 24 }),
  showMore: () => set((state) => ({ shown: state.shown + 24 })),
  select: (selectedKey) => set({ selectedKey }),
  setTheme: (theme) => set({ theme }),
  notify: (notice) => set({ notice }),
}));
