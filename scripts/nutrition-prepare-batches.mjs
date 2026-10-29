import path from "node:path";
import { pathToFileURL } from "node:url";
import { atomicJSON, readJSON, nutritionRoot } from "./nutrition-usda.mjs";
import { loadRecipeContents } from "./recipe-content.mjs";

const aliases = {
  egg: /鸡蛋|蛋液/,
  tomato: /番茄|西红柿/,
  sugar: /白糖|白砂糖|冰糖/,
  salt: /食盐|盐/,
  garlic: /蒜/,
  soy: /生抽|老抽|酱油|味极鲜/,
  oyster: /蚝油|耗油/,
  sesame_oil: /香油|芝麻油/,
  vinegar: /醋/,
  milk: /牛奶/,
  rice_cooked: /米饭/,
  corn_cooked: /玉米/,
  cucumber: /黄瓜/,
  oil: /食用油|菜籽油|花生油|大豆油/,
  potato: /土豆/,
  cabbage: /包菜/,
  napa: /白菜|娃娃菜/,
  water_spinach: /空心菜/,
  cauliflower: /花菜|菜花/,
  broccoli: /西兰花|西蓝花/,
  spinach: /菠菜/,
  lettuce: /生菜/,
  celery: /芹菜/,
  onion: /洋葱/,
  eggplant: /茄子/,
  pumpkin: /南瓜/,
  carrot: /胡萝卜/,
  zucchini: /西葫芦/,
  pepper_green: /青椒|菜椒/,
  chili: /辣椒|小米辣/,
  ginger: /姜/,
  scallion: /葱/,
  sesame: /芝麻粒|芝麻仁/,
  tahini: /芝麻酱/,
  starch: /淀粉|生粉/,
  flour: /面粉/,
  butter: /黄油/,
  honey: /蜂蜜/,
  tofu: /豆腐/,
  enoki: /金针菇/,
  shiitake: /香菇/,
  mushroom: /蘑菇/,
  green_beans: /四季豆|豆角/,
  lotus: /莲藕/,
  pine_nut: /松子|松仁/,
  peas: /豌豆/,
  taro: /芋头/,
  winter_melon: /冬瓜/,
  rice_dry: /大米|白米/,
  oats_dry: /燕麦/,
  bread: /吐司|面包片/,
  jam: /果酱/,
  peanut: /花生/,
  pasta: /意大利面|通心粉|意面/,
  cream: /淡奶油|稀奶油/,
  yogurt: /酸奶/,
  lemon: /柠檬/,
  banana: /香蕉/,
  strawberry: /草莓/,
  mango: /芒果/,
  orange: /橙子/,
  avocado: /牛油果/,
  coconut_milk: /椰奶/,
  coffee: /咖啡/,
  tea: /红茶|茶叶/,
  milk_condensed: /炼乳/,
  cocoa: /可可/,
  yeast: /酵母/,
  baking_powder: /泡打粉/,
  gelatin: /吉利丁/,
  ketchup: /番茄酱/,
  wood_ear: /木耳/,
  bok_choy: /青菜|小白菜/,
  yam: /山药/,
  millet: /小米粥|小米\s*\d/,
  walnut: /核桃/,
  red_beans: /红芸豆/,
  mung_noodles: /粉丝|粉条/,
  duck_preserved: /皮蛋/,
  pork_belly: /五花肉/,
  pork_lean: /里脊|瘦肉/,
  pork_ground: /肉馅|肉末|猪肉/,
  beef: /牛肉|牛腩|肥牛|牛排/,
  chicken_thigh: /鸡肉|鸡腿|仔鸡|整鸡/,
  chicken_breast: /鸡胸/,
  chicken_wing: /鸡翅/,
  duck: /鸭/,
  lamb: /羊肉|羊排/,
  shrimp: /虾/,
  carp: /鲤鱼/,
  bass: /鲈鱼/,
  salmon: /三文鱼/,
  crab: /蟹/,
  clams: /蛤蜊|蛏/,
  oyster_meat: /生蚝|牡蛎/,
  tuna_can: /金枪鱼/,
  bacon: /培根/,
  sausage: /香肠|腊肠/,
  cheese: /奶酪|芝士/,
  cream_cheese: /奶油奶酪/,
  raisin: /葡萄干/,
  dates: /红枣/,
  longan: /桂圆/,
  lard: /猪油/,
  kiwi: /奇异果|猕猴桃/,
  pineapple: /菠萝/,
  passionfruit: /百香果/,
  coconut_water: /椰子水/,
  cardamom: /小豆蔻/,
  cinnamon: /肉桂/,
};

export async function prepareNutritionBatches({ root = nutritionRoot } = {}) {
  const load = (file) => readJSON(path.join(root, file));
  const [source, config, library, plans] = await Promise.all(
    [
      "catalog/howtocook.json",
      "catalog/illustrations.json",
      "catalog/nutrition/ingredients.json",
      "catalog/nutrition/plans/standard-families.json",
    ].map(load),
  );
  const first = await load("catalog/nutrition/batches/batch-001.json");
  const firstIds = new Set(first.jobs.map((item) => item.recipe_id));
  const published = new Set(config.artworks.flatMap((a) => a.recipe_ids));
  const contents = await loadRecipeContents(root, source, config);
  const definitions = new Map(
    library.ingredients.map((item) => [item.key, item]),
  );
  const all = source.recipes.filter(
    (r) => published.has(r.id) && !firstIds.has(r.id),
  );
  const work = [];
  for (let offset = 0; offset < all.length; offset += 24) {
    const batch = `batch-${String(2 + offset / 24).padStart(3, "0")}`;
    const jobs = [];
    for (const recipe of all.slice(offset, offset + 24)) {
      const content = contents.get(recipe.id);
      const ingredients = content.sections
        .filter((s) => /原料|材料|食材/.test(s.heading))
        .map((s) => s.markdown)
        .join("\n");
      const plan = plans.recipes.find((p) => p.recipe_id === recipe.id);
      const keys = plan
        ? plan.ingredients.map((item) => item.key)
        : Object.entries(aliases)
            .filter(([, pattern]) => pattern.test(ingredients || recipe.name))
            .map(([key]) => key);
      const queries = [
        ...new Set(
          keys
            .map((key) => {
              const item = definitions.get(key);
              return item?.data_types
                ? { query: item.query, data_types: item.data_types }
                : item?.query;
            })
            .filter(Boolean),
        ),
      ];
      jobs.push({ recipe_id: recipe.id, queries });
      work.push({
        recipe_id: recipe.id,
        recipe_blob_sha: recipe.blob_sha,
        name: recipe.name,
        category: recipe.category,
        batch,
        original_ingredients: ingredients,
        ingredient_candidates: keys,
        external_foods: keys
          .map((key) => definitions.get(key))
          .filter((item) => item?.provider)
          .map((item) => ({
            provider: item.provider,
            food_id: item.food_id,
            snapshot_sha256: item.snapshot_sha256,
            source_url: item.source_url,
            mapping_review_status: item.mapping_review?.status ?? "pending",
          })),
        has_explicit_standard_plan: !!plan,
        queries,
      });
    }
    await atomicJSON(
      path.join(root, "catalog/nutrition/batches", `${batch}.json`),
      {
        schema_version: 1,
        description:
          "逐篇读取固定摘要原文并建立食材候选任务；只生成候选，不自动审核或发布营养。",
        jobs,
      },
    );
  }
  await atomicJSON(path.join(root, "catalog/nutrition/worklist.json"), {
    schema_version: 1,
    total: work.length,
    recipes: work,
  });
  return work;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(
    `已建立 ${(await prepareNutritionBatches()).length} 篇的分批任务，每批24篇。`,
  );
