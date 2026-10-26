import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, ArrowUpRight, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hero } from "@/components/hero";
import { PromptSection } from "@/components/prompt-section";
import { CatalogSection } from "@/components/catalog-section";
import { SiteInfo } from "@/components/site-info";
import { useCatalogStore } from "@/stores/catalog-store";
import { useTheme } from "@/hooks/use-theme";

export function App() {
  const load = useCatalogStore((state) => state.load);
  const notice = useCatalogStore((state) => state.notice);
  const notify = useCatalogStore((state) => state.notify);
  const { dark, toggle } = useTheme();
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => notify(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice, notify]);
  return (
    <>
      <a className="skip-link" href="#catalog">
        跳到菜谱图鉴
      </a>
      <header className="site-header wrap">
        <a className="brand" href="./" aria-label="Recipe Art Catalog 首页">
          <span className="brand-mark" aria-hidden="true">
            r.
          </span>
          <span>
            Recipe Art<span className="brand-sub">CATALOG</span>
          </span>
        </a>
        <nav aria-label="主导航">
          <a href="#catalog">插画图鉴</a>
          <a href="#prompt">生成 Prompt</a>
          <a className="nav-secondary" href="#connect">
            数据接入
          </a>
          <a href="#source">
            开源来源
            <ArrowUpRight aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main>
        <Hero />
        <CatalogSection />
        <PromptSection />
        <SiteInfo />
      </main>
      <footer className="site-footer wrap">
        <a className="footer-brand" href="./">
          Recipe Art Catalog
        </a>
        <p>把日常的美味，画成喜欢的样子。</p>
        <Button variant="ghost" size="sm" onClick={toggle}>
          {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          {dark ? "浅色外观" : "深色外观"}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href="#catalog">
            回到图鉴
            <ArrowUp aria-hidden="true" />
          </a>
        </Button>
      </footer>
      <div
        className="toast-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence>
          {notice && (
            <motion.p
              className="toast"
              key={notice}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {notice}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
