import { pinyin } from "pinyin-pro";

// 只扩展同一种食材的常见叫法，不把近似食材或口味当作等价名称。
const synonyms = [
  ["西红柿", "番茄"],
  ["土豆", "马铃薯", "洋芋"],
  ["包菜", "卷心菜", "圆白菜"],
  ["花菜", "菜花"],
  ["西兰花", "绿花椰菜"],
  ["莴笋", "莴苣笋"],
  ["桂圆", "龙眼"],
  ["奇异果", "猕猴桃"],
  ["牛油果", "鳄梨"],
  ["凤梨", "菠萝"],
  ["芝士", "奶酪"],
  ["意面", "意大利面"],
  ["馄饨", "云吞"],
  ["醪糟", "酒酿"],
  ["鳜鱼", "桂鱼"],
];

export function createSearchTerms(artwork) {
  const names = new Set(
    [
      artwork.name,
      ...(artwork.aliases ?? []),
      ...artwork.reference_recipes.map((recipe) => recipe.name),
    ].filter(Boolean),
  );
  for (const group of synonyms) {
    for (const name of [...names]) {
      for (const source of group) {
        if (name.includes(source))
          for (const target of group)
            names.add(name.replaceAll(source, target));
      }
    }
  }
  const terms = new Set();
  for (const name of names) {
    terms.add(name);
    for (const pattern of ["pinyin", "first"])
      terms.add(
        pinyin(name, {
          toneType: "none",
          pattern,
          v: true,
          type: "array",
        }).join(""),
      );
  }
  return [...terms].map((term) =>
    term.normalize("NFKC").replace(/\s+/g, "").toLowerCase(),
  );
}
