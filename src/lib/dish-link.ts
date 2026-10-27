export function getDishURL(key: string, currentURL = window.location.href) {
  const url = new URL(currentURL);
  url.search = "";
  url.searchParams.set("dish", key);
  url.hash = "catalog";
  return url.href;
}
