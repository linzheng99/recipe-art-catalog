import { useCatalogStore } from "@/stores/catalog-store";

export async function copyText(
  value: string,
  successMessage = "内容已复制",
  fallbackLabel = "请复制以下内容",
) {
  try {
    await navigator.clipboard.writeText(value);
    useCatalogStore.getState().notify(successMessage);
  } catch {
    // 浏览器可能禁用剪贴板；展示可选文本，不把失败报告成成功。
    window.prompt(fallbackLabel, value);
  }
}

export function copyAddress(value: string) {
  return copyText(value, "地址已复制", "请复制这个地址");
}
