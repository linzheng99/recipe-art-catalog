import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// 同时发布运行时传递依赖和生成的 UI/CSS 许可证；不将这些许可延伸到项目自有内容。
export async function writeFrontendNotices(root, { check = false } = {}) {
  const lock = JSON.parse(
    await readFile(path.join(root, "package-lock.json"), "utf8"),
  );
  const includedTools = new Set([
    "node_modules/shadcn",
    "node_modules/tailwindcss",
    "node_modules/tw-animate-css",
    "node_modules/pinyin-pro",
  ]);
  const entries = Object.entries(lock.packages)
    .filter(
      ([location, pkg]) =>
        location && (!pkg.dev || includedTools.has(location)),
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const sections = [
    "Frontend dependencies and third-party license texts",
    "Generated from package-lock.json. Includes runtime transitive dependencies and the shadcn/ui, Tailwind CSS, tw-animate-css, and build-time pinyin-pro sources.",
  ];
  for (const [location] of entries) {
    const directory = path.join(root, location);
    const pkg = JSON.parse(
      await readFile(path.join(directory, "package.json"), "utf8"),
    );
    const files = (await readdir(directory))
      .filter((name) => /^(license|licence|copying|notice)([.-]|$)/i.test(name))
      .sort();
    let texts = await Promise.all(
      files.map((name) => readFile(path.join(directory, name), "utf8")),
    );
    if (pkg.name === "react-remove-scroll-bar" && texts.length === 0) {
      // 该 npm 包未附 LICENSE，使用另外保留的上游原文，来源见 THIRD_PARTY_NOTICES。
      texts = [
        await readFile(
          path.join(root, "licenses/react-remove-scroll-bar-LICENSE.txt"),
          "utf8",
        ),
      ];
    }
    if (texts.length === 0) throw new Error(`缺少前端依赖许可证：${pkg.name}`);
    sections.push(
      `${pkg.name}@${pkg.version} (${pkg.license ?? "see license"})`,
      ...texts.map((text) => text.trim()),
    );
  }
  const output =
    sections.join("\n\n----------------------------------------\n\n") + "\n";
  const target = path.join(root, "public/licenses/FRONTEND-DEPENDENCIES.txt");
  if (check) {
    if ((await readFile(target, "utf8")) !== output)
      throw new Error("前端依赖许可副本过期，请运行 npm run build");
  } else await writeFile(target, output);
}
