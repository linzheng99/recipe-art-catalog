import { createHash } from "node:crypto";

// 完整目录仍是历史证据；浏览索引只派生出页面需要的数据，不改写归档。
export function createRuntimeCatalog(manifest) {
  const details = [];
  const artworks = manifest.artworks.map(({ generation, ...artwork }) => {
    const references = artwork.reference_recipes;
    const item = {
      ...artwork,
      reference_recipes: references.map(
        ({ details, ...reference }) => reference,
      ),
    };
    if (references.some((reference) => reference.details)) {
      const text =
        JSON.stringify({
          schema_version: 1,
          key: artwork.key,
          reference_recipes: references,
        }) + "\n";
      const sha256 = createHash("sha256").update(text).digest("hex");
      const descriptor = {
        path: `assets/recipe-details/${artwork.key}.${sha256.slice(0, 16)}.json`,
        bytes: Buffer.byteLength(text),
        sha256,
      };
      item.recipe_details = descriptor;
      details.push({ ...descriptor, text });
    }
    return item;
  });
  return { index: { ...manifest, artworks }, details };
}
