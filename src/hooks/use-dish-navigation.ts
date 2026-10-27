import { useCallback, useEffect, useRef } from "react";
import { useCatalogStore } from "@/stores/catalog-store";

const entryMarker = "recipe-art-catalog:dish";

function historyState() {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null
    ? { ...(state as Record<string, unknown>) }
    : {};
}

export function useDishNavigation() {
  const catalog = useCatalogStore((state) => state.catalog);
  const select = useCatalogStore((state) => state.select);
  const notify = useCatalogStore((state) => state.notify);
  const closing = useRef(false);

  useEffect(() => {
    if (!catalog) return;
    const syncLocation = () => {
      closing.current = false;
      const url = new URL(window.location.href);
      const key = url.searchParams.get("dish");
      if (key !== null && !catalog.artworks.some((item) => item.key === key)) {
        url.searchParams.delete("dish");
        const state = historyState();
        delete state[entryMarker];
        window.history.replaceState(state, "", url);
        select(null);
        notify("没有找到分享的菜品，已返回图鉴。");
      } else {
        select(key);
      }
    };
    // 等目录加载后再解析分享标识，避免把尚未加载的菜品误判为不存在。
    syncLocation();
    window.addEventListener("popstate", syncLocation);
    return () => window.removeEventListener("popstate", syncLocation);
  }, [catalog, select, notify]);

  return useCallback(
    (key: string | null) => {
      const url = new URL(window.location.href);
      const currentKey = url.searchParams.get("dish");
      const state = historyState();
      if (key !== null) {
        if (!catalog?.artworks.some((item) => item.key === key)) return;
        closing.current = false;
        if (currentKey !== key) {
          url.searchParams.set("dish", key);
          if (currentKey !== null) {
            window.history.replaceState(state, "", url);
          } else {
            window.history.pushState(
              { ...state, [entryMarker]: true },
              "",
              url,
            );
          }
        }
        select(key);
        return;
      }
      if (closing.current) return;
      select(null);
      if (currentKey === null) return;
      // 点击卡片新增的记录可后退关闭；直接进入的分享链接只替换当前地址，避免退出网站。
      if (state[entryMarker] === true) {
        closing.current = true;
        window.history.back();
      } else {
        url.searchParams.delete("dish");
        delete state[entryMarker];
        window.history.replaceState(state, "", url);
      }
    },
    [catalog, select],
  );
}
