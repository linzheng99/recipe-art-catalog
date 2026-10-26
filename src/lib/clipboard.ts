import { useCatalogStore } from "@/stores/catalog-store";

export async function copyAddress(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    useCatalogStore.getState().notify("地址已复制");
  } catch {
    // 浏览器可能禁用剪贴板；展示可选文本，不把失败报告成成功。
    window.prompt("请复制这个地址", value);
  }
}
