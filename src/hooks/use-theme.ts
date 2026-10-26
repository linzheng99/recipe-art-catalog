import { useEffect, useSyncExternalStore } from "react";
import { useCatalogStore } from "@/stores/catalog-store";

const subscribe = (callback: () => void) => {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const getSnapshot = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export function useTheme() {
  const systemDark = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const theme = useCatalogStore((state) => state.theme);
  const setTheme = useCatalogStore((state) => state.setTheme);
  const dark = theme === "system" ? systemDark : theme === "dark";
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);
  return { dark, toggle: () => setTheme(dark ? "light" : "dark") };
}
