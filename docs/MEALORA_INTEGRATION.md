# Mealora读取营养参考

Mealora读取本项目**按菜谱汇总、计算后的JSON**。不读取 `sources/nutrition/usda/`，也不在前端放USDA Key。

营养数据由GitHub Actions随站点构建发布。请以实际部署的版本为准；未部署的新入口返回404时使用已有完整入口或其他来源，不将本地构建状态当作线上状态。

## 直接读取一个汇总JSON

新接入推荐 `https://linzheng99.github.io/recipe-art-catalog/nutrition/index-lite.json`，字段仍是 `recipes[].nutrition.per_100g`。轻量文件只存一份运行时方案，保留scope、match、来源版本、重量假设、代理精度和详情摘要，省略候选、处理历史和重复的profiles数组。多方案时nutrition为unknown，需从该行nutrition_profiles中独立选择，不以插画合并。完整入口继续兼容。

`loadNutritionIndex` 默认从manifest的 `nutrition_catalog.lite` 获取轻量地址并验证字节数与SHA-256，然后在内存恢复原有profiles接口。旧manifest没有lite描述时读取完整入口；可传 `{ format: "full" }` 显式获取评估记录。轻量请求失败、摘要或版本不一致时返回fallback，不静默接受损坏数据。直接读取JSON的应用也应保存version并检查schema_version。

部署后的入口：

```text
https://linzheng99.github.io/recipe-art-catalog/nutrition/index.json
```

每篇菜谱都在 `recipes[]` 中，包括未知和待核验条目。以真实生成数据中的西红柿炒鸡蛋为例：

```json
{
  "recipe_id": "howtocook-2130948c0fd2",
  "name": "西红柿炒鸡蛋",
  "status": "recipe_estimate",
  "nutrition": {
    "profile_id": "family-2130948c0fd2-v1",
    "status": "reference",
    "review_status": "approved",
    "method": "usda_recipe_estimate",
    "recipe_basis": "standardized_assumptions",
    "basis": "per_100g",
    "is_estimate": true,
    "per_100g": {
      "energy_kcal": 81.996,
      "protein_g": 4.50596,
      "carbohydrate_g": 4.21608,
      "fat_g": 5.41528
    }
  }
}
```

以上节选省略了完整对象中的scope、match、source、data_version及details等字段，实际JSON均保留。这份估算限定为番茄400g、净蛋液150g、油12g、盐3g、糖4g、葱6g，整份成品重量假设为500g，供2–3人；非原菜谱实测。不能把该参考当成任意番茄炒蛋的精确值。

```js
const url = 'https://linzheng99.github.io/recipe-art-catalog/nutrition/index.json';
const response = await fetch(url);
if (!response.ok) throw new Error('营养目录未部署或暂不可用，需要回退');
const catalog = await response.json();
if (catalog.schema_version !== 1) throw new Error('不支持的营养目录版本');

const recipe = catalog.recipes.find(
  item => item.recipe_id === 'howtocook-2130948c0fd2'
);
const nutrition = recipe?.nutrition;
const available = nutrition?.status === 'reference'
  && nutrition.review_status === 'approved';

// available仅表示存在参考。还须核对scope/match及标准配方假设后再使用。
// 核对通过后，150g食用量的热量参考为约122.994kcal。
const kcal = available && nutrition.per_100g.energy_kcal !== null
  ? nutrition.per_100g.energy_kcal * 150 / 100
  : null;
```

已有图片匹配结果时，可用图片条目的 `reference_recipes[].id` 定位菜谱。按菜名搜索只用于发现候选；不能仅凭同图、别名或模糊菜名自动选择营养。同一张蒸蛋插画的两篇配方在索引中各有独立的 `nutrition`。

## 复用已测试的客户端工具

源码为 `src/lib/nutrition-client.mjs`，随站点发布为 `nutrition/client.js`。可以将源码及相邻的 `nutrition-client.d.mts` 类型声明一起复制到Mealora；它是无依赖ES模块，适用于现代浏览器、TypeScript项目和Node.js，不含任何密钥。

```js
import {
  loadNutritionIndex,
  findNutritionProfiles,
  calculateNutrition,
  loadNutritionDetails,
} from './nutrition-client.mjs';

const manifestURL = 'https://linzheng99.github.io/recipe-art-catalog/manifest-lite.json';
const loaded = await loadNutritionIndex(manifestURL);
const found = findNutritionProfiles(loaded, {
  recipeId: 'howtocook-b13f782654bf',
  // 如果Mealora保留了HowToCook固定版本，可同时传recipeBlobSha。
});

if (found.status === 'needs_match_confirmation') {
  // 应由Mealora核对用户食物与scope/match，或让用户选择明确的标准配方。
  const profile = found.candidates.find(p => p.id === 'steamed-water-egg-family-v1');
  if (profile) {
    const result = calculateNutrition(profile, 150, {
      confirmedProfileId: profile.id,
      acceptStandardRecipe: true,
      acceptAssumedWeight: true,
    });
    // result.portion.nutrients为150g的四项营养；此例约89.375kcal。
    // 将result.is_estimate、scope、source、data_version一并保存/展示。
    const provenance = await loadNutritionDetails(loaded, profile);
  }
}
```

三个确认参数不是USDA认证，也不代表工具自动完成食物匹配；应在应用完成范围核对或用户选择标准配方后传入。默认拒绝未确认的方案、未接受的标准配方或成品重量假设。旧目录缺字段、HTTP失败、源版本混合及详情摘要不符都有显式回退结果。

`loadNutritionDetails`按manifest所在目录解析详情路径并核对字节数与SHA-256。`details.path`不是相对于 `nutrition/index.json` 的目录。详情包含各食材克数、真实FDC ID与来源版本、整份计算、成品重量假设及审核证据。

## 未知、部分已知与USDA回退

Actions每次发布还提供 `nutrition/changes.json`，包含本次push对应的from_version、to_version和前后方案，用于解释变化。Mealora应以索引version决定更新；只有from_version与本地缓存版本一致时才能将该摘要视作完整的相邻版本差异。版本不连续时重新读取整份索引，不能只应用最新一次差异。部署后会自动核对线上入口、全部菜谱投影与典型详情摘要。

- `nutrition.status=unknown`、候选待核验、范围不符或请求失败：保持null，回退USDA或其他合适来源。
- 某项为null时，只回退查询该项，其他已知项仍可计算；不把null替换为0。
- `calculateNutrition`返回partial时，`missing_nutrients`列出缺项；来源明确的真实0仍为0。
- USDA查询放在Mealora自己的服务端或受控同步工具中，使用环境变量/Secret和可复用缓存。没有安全服务端时，可同步官方公开数据，不将Key放浏览器。
- 缓存索引时保存version；更新时整份替换，避免把不同版本的摘要和详情混合。图片缓存与营养缓存独立。

本仓库没有改动Mealora应用或宣称完成其实际界面接入；交付的是公开JSON协议、可复制工具及通过真实构建数据的Node/浏览器集成验证。

## 油炸家庭份真实示例

糖醋里脊（`howtocook-788feaed2146`）公开摘要节选：

```json
{
  "profile_id": "family-788feaed2146-v1",
  "status": "reference",
  "method": "usda_recipe_estimate",
  "recipe_basis": "standardized_assumptions",
  "basis": "per_100g",
  "per_100g": {
    "energy_kcal": 179.185,
    "protein_g": 13.603167,
    "carbohydrate_g": 14.49825,
    "fat_g": 7.088017
  }
}
```

这份标准方案假设里脊净350g、保留油30g、保留淀粉50g、蛋液50g及列明的挂汁调料，整份成品600g，非实测；并非计算炸锅里的全部油。实际JSON还保留scope、match、来源与版本。详情的 `profile.process.assumed_retained_oil_g` 和计算食材中 `quantity.role=retained_frying_oil` 可核验该30g假设；整份热量为1075.11kcal，150g成品约268.778kcal。Mealora可直接取每100g数值，但应展示估算标记、允许用户选择标准份量或用实际配方重算。

## 新增官方食物成分来源

目前372篇有可读参考，其中21篇属于同类食物代理粗估。JSON字段位置保持不变；混合来源方案新增 `method=recipe_estimate`，旧USDA方法仍为 `usda_direct` / `usda_recipe_estimate`。严格枚举或旧版客户端请更新本仓库的客户端及类型声明。

例如 `howtocook-cf76d9b00d1d`（韭菜炒蛋）的 `nutrition.per_100g` 为：

```json
{
  "energy_kcal": 138.555556,
  "protein_g": 7.944444,
  "carbohydrate_g": 2.622222,
  "fat_g": 11.005556
}
```

它的 `source.providers` 是 `["mext", "usda"]`，`source.food_ids` 包含 `{ "provider": "mext", "id": "06207" }`，`source.fdc_ids`保留鸡蛋、油、盐的真实USDA编号。MEXT编号不是FDC ID。详情记录各食材克数与来源、完整计算及MEXT出处要求；Mealora需要保留来源署名，不能将整份数据统称USDA/CC0。

标准韭菜200g、蛋200g、油20g、盐3g，成品360g为假设；确认匹配并接受假设后，180g成品约249.4kcal。现有 `calculateNutrition` 与 `loadNutritionDetails` 已验证这一真实混合来源方案，调用方式不变。范围不符或未知时仍回退到适用的USDA或其他来源。


韩国年度DB食材使用 `source.food_ids: [{ "provider": "krda", "id": "K0600000000a" }]`，仍属 `recipe_estimate`。更新客户端副本后可直接解析，USDA编号仍在 `source.fdc_ids` 中。响油鳝丝 `recipe_id=howtocook-b9a1d9770073` 的每100g为154.821667kcal、蛋白质13.044583g、碳水8.990917g、脂肪7.091233g；假设整份600g，150g约232.2325kcal。使用前接受注明的家庭配方和成品重量假设，不把黄鳝图片匹配当作营养匹配。鳜鱼代理或鲜茶树菇自制版本不适用时，继续回退到对应食材/品牌的独立来源检索。


## 同类食物代理结果

读取地址和字段不变：`nutrition/index.json` → 按recipe_id选择 `recipes[].nutrition.per_100g`。若 `estimation_level === "food_group_proxy"`，显示“同类食物估算”；`match.food_proxies`记录代用了什么，不应显示成对应品牌或原物种的测定值。新版客户端会把该字段原样带到克数换算结果中，不新增确认参数，沿用标准配方和成品重量假设的选项。

水煮鱼 `howtocook-eb849be42cbb` 的真实代理方案：v2固定Good & Gather巴沙鱼生片350g（UPC085239019023），合计成品950g。每100g为70.237895kcal、蛋白质7.098442g、碳水2.667579g、脂肪3.548863g；150g约105.3568425kcal。肉量排除骨头，全部列入的油糖酱和汤汁计入。这是选定家庭模型的粗估，不是USDA对巴沙鱼水煮鱼的直接测定。

```js
const selected = index.recipes.find(r => r.recipe_id === 'howtocook-eb849be42cbb');
const profile = selected.nutrition;
const values = profile.per_100g;
const label = profile.estimation_level === 'food_group_proxy' ? '同类食物估算' : '营养参考';
```

希望采用较精确来源时，可依据estimation_level和match条件跳过代理方案，并在应用服务端用USDA查询实际食材/品牌。原方案不适用、值为null或未发布时仍按原规则回退；图片匹配不会自动接受营养代理。火锅底料仅针对浓缩底料，冰粉方案仅针对无糖基底，其他实际添加需另算。
