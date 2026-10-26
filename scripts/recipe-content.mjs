import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

function displayText(text) {
  // 页面不复用上游照片，也不重复显示每篇末尾的协作说明；归档原文保持不变。
  return text
    .replace(/^\s*!\[[^\]]*\]\([^\n]*\)\s*$/gm, "")
    .replace(
      /^.*如果您遵循本指南的制作流程而发现有问题或可以改进的流程.*$/gm,
      "",
    )
    .trim();
}

export function parseRecipeContent(markdown) {
  const intro = [];
  const sections = [];
  let current = intro;
  let difficulty = null;
  let fence = null;
  let titleRemoved = false;
  for (const line of markdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length)
        fence = null;
      current.push(line);
      continue;
    }
    if (!fence) {
      if (!titleRemoved && /^#\s+/.test(line) && sections.length === 0) {
        titleRemoved = true;
        continue;
      }
      const heading = line.match(/^##\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const section = { heading: heading[1], lines: [] };
        sections.push(section);
        current = section.lines;
        continue;
      }
      if (sections.length === 0) {
        const match = line.match(/^\s*预估烹饪难度\s*[:：]\s*(.*?)\s*$/);
        if (match) {
          difficulty = match[1] || null;
          continue;
        }
        // 原文热量没有每100g基准，不导入本站的营养数据，也不混入菜品介绍。
        if (/^\s*预估卡路里\s*[:：]/.test(line)) continue;
      }
    }
    current.push(line);
  }
  return {
    introduction: displayText(intro.join("\n")),
    difficulty,
    sections: sections
      .map(({ heading, lines }) => ({
        heading,
        markdown: displayText(lines.join("\n")),
      }))
      .filter((section) => section.markdown),
  };
}

export async function loadRecipeContents(root, source, config) {
  const published = new Set(
    config.artworks.flatMap((artwork) => artwork.recipe_ids),
  );
  const contents = await Promise.all(
    source.recipes
      .filter((recipe) => published.has(recipe.id))
      .map(async (recipe) => {
        if (!/^howtocook-[a-f0-9]{12}$/.test(recipe.id))
          throw new Error(`非法菜谱ID：${recipe.id}`);
        const data = await readFile(
          path.join(
            root,
            "sources/references/howtocook-sources",
            `${recipe.id}.md`,
          ),
        );
        const digest = createHash("sha1")
          .update(`blob ${data.length}\0`)
          .update(data)
          .digest("hex");
        if (digest !== recipe.blob_sha)
          throw new Error(`菜谱原文摘要不一致：${recipe.name}`);
        return [recipe.id, parseRecipeContent(data.toString("utf8"))];
      }),
  );
  return new Map(contents);
}
