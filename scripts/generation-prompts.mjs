import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export function collectGenerationPrompts(documents) {
  const prompts = new Map();
  for (const { source_file, data } of documents) {
    if (!Array.isArray(data.artworks)) continue;
    for (const item of data.artworks) {
      if (
        typeof item.key !== "string" ||
        typeof item.prompt !== "string" ||
        !item.prompt.trim() ||
        typeof data.tool !== "string" ||
        typeof data.style_reference !== "string" ||
        (item.correction &&
          (typeof item.correction.prompt !== "string" ||
            !item.correction.prompt.trim() ||
            typeof item.correction.reason !== "string"))
      )
        throw new Error(`生成提示词记录不完整：${source_file}`);
      if (prompts.has(item.key))
        throw new Error(`生成提示词 key 重复：${item.key}`);
      // 只读取归档原文，不因更名、发布状态或前端展示而改写历史记录。
      prompts.set(item.key, {
        prompt: item.prompt,
        correction: item.correction
          ? { prompt: item.correction.prompt, reason: item.correction.reason }
          : null,
        tool: data.tool,
        style_reference: data.style_reference,
        source_file,
      });
    }
  }
  return prompts;
}

export async function loadGenerationPrompts(root) {
  const directory = path.join(root, "sources/prompts");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return collectGenerationPrompts(
    await Promise.all(
      files.map(async (file) => ({
        source_file: `sources/prompts/${file}`,
        data: JSON.parse(await readFile(path.join(directory, file), "utf8")),
      })),
    ),
  );
}
