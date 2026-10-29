# USDA Key 与通用调用工具

搜索响应与食品快照默认保存为无损 `.json.gz`，工具兼容原 `.json` 路径和旧明文缓存。直接调用 `readJSON` 或 `normalize sources/nutrition/usda/171287.json` 即可，无需自行解压。`npm run nutrition:compress` 预览存量压缩；加 `-- --apply` 后，逐字节回读校验成功才移除明文副本，并写入 `sources/nutrition/cache-archive.json`，记录两种文件的SHA-256和大小。更新缓存后可重跑更新归档清单，已有压缩记录不会重复生成。原始响应、日期、FDC ID、数值和响应摘要均不变，Git历史不重写。

此工具供本地脚本或服务端调用 USDA；不依赖菜谱、插画、React 或数据库。只使用 Node.js 内置库，最低版本与项目一致（22.14）。原始资料按 FDC ID 或查询摘要缓存，沿用超时、限流、重试和本地请求预算。

## 申请、配置与验证 Key

1. 打开 [USDA 官方申请页](https://fdc.nal.usda.gov/api-key-signup/)，按表单填写并领取 api.data.gov Key；也可使用 [api.data.gov 注册页](https://api.data.gov/signup/)。操作细节以页面和邮件提示为准。
2. 在项目根目录把 `.env.example` 复制为 `.env.local`，保留原文件，填入自己的 Key。已有 .env.local 时直接编辑，不要覆盖。

```dotenv
FDC_API_KEY=在本地填入你申请的Key
```

3. 运行验证。此命令确实向 USDA 发一次请求，缓存命中不会被误认为 Key 验证成功。

```sh
npm run usda -- check-key
```

成功只输出 ok、检查时间和上游配额头，不输出 Key 或认证头。401/403 时检查 Key 是否正确、有效；429 时等待限流解除。缺少 Key 时显式失败。共享演示 Key 可加 `--demo`，但不适合持续同步。

`.env.local` 已被 Git 忽略。请只在本地文件或 CI Secret 配置 Key，不粘贴进聊天、公开 issue 或截图。线上应用应在服务端配置环境变量；本项目是静态站点，不把 Key 放到 VITE_ 变量、浏览器包或 GitHub Pages。

官方当前默认配额是 1000 请求/小时/IP；DEMO_KEY 为 30 请求/小时/IP、50 请求/天/IP，具体以[官方指南](https://fdc.nal.usda.gov/api-guide/)和响应头为准。本工具采用更保守的私人 Key 本地预算 900/小时，并处理 429，不保证其他同 IP 调用不会提前耗尽配额。

## 从请求到可使用的数据

处理顺序：**Key认证请求 → 原始响应缓存 → 依据营养素ID读取数值与单位 → 每100g统一字段 → 可选可食克数换算 → 适用条件独立审核**。

认证使用 X-Api-Key 请求头，方式见 [api.data.gov 开发手册](https://api.data.gov/docs/developer-manual/)，避免将 Key 拼到来源 URL。

```sh
# 搜索候选；不默认采用第一项。
npm run usda -- search "Egg whole cooked hard boiled"

# 核对候选后显式选FDC ID。已缓存时直接复用，无需Key或网络。
npm run usda -- food 173424 --grams 150

# 派生结果写入本地JSON，方便其他应用读取。
npm run usda -- food 173424 --grams 150 --out .cache/usda/egg-150g.json

# 对已保存原始缓存离线解析，不发请求。
npm run usda -- normalize sources/nutrition/usda/173424.json --grams 150
```

`normalize` 接收本工具的缓存封套（有 schema_version、retrieved_at、response、raw_sha256），不是没有来源信息的裸JSON。缓存中 response 保存 USDA 原始对象，摘要按 JSON.stringify(response) 校验；派生文件不回写原始响应。工具识别 Food Details 的嵌套 nutrient/amount 和 Search 的扁平 nutrientId/value 格式。

字段映射：1008 kcal → energy_kcal，1003 g → protein_g，1005 g → carbohydrate_g，1004 g → fat_g。缺少1008时才采用 USDA 明确提供的 Atwater kcal（2048、2047），不拿 kJ 或4/4/9冒充来源热量。每项单独处理缺失，缺失为 null，已知0保留0。食用量只接受正的净可食克数，ml换g需另行核对密度。

当前缓存的 FDC 173424（全熟去壳鸡蛋）解析后字段节选：

```json
{
  "kind": "usda_food_candidate",
  "fdc_id": 173424,
  "review_status": "pending",
  "approved_for_recipe": false,
  "basis": "per_100g",
  "completeness": "complete",
  "per_100g": {
    "energy_kcal": 155,
    "protein_g": 12.58,
    "carbohydrate_g": 1.12,
    "fat_g": 10.61
  },
  "portion": {
    "edible_g": 150,
    "nutrients": {
      "energy_kcal": 232.5,
      "protein_g": 18.87,
      "carbohydrate_g": 1.68,
      "fat_g": 15.915
    }
  }
}
```

150g是调用方显式传入的示例净重，不是默认一颗鸡蛋重量。完整输出还包含 USDA 来源 URL、数据类型、发布版本、获取日期、响应摘要和实际营养素ID。即使四项完整，review_status仍为pending：解析成功不代表与流心蛋、其他蛋种或添加油酱后的食物匹配。

搜索只输出第一页最多20项候选和来源摘要。空结果是检索未命中，不代表已证明无合理匹配。非成功HTTP响应、损坏缓存、单位或数值异常均应作为失败处理，不填0。

## 在其他 Node 应用复用

复制五个 Node 模块：scripts/nutrition-usda.mjs、scripts/nutrition-model.mjs、scripts/nutrition-composition.mjs、scripts/nutrition-krda.mjs、scripts/usda.mjs。它们只相互引用，不需要本站其他模块或 npm 运行时依赖。仅使用USDA功能不需要Python；官方XLSX导入才需要Python3和提取脚本。Key由调用方配置，缓存根目录传入应用自己的工作目录。

```js
import { createUSDAClient } from './scripts/nutrition-usda.mjs';
import { normalizeFoodCandidate } from './scripts/usda.mjs';

const client = createUSDAClient({
  apiKey: process.env.FDC_API_KEY,
  root: process.cwd(),
});

// 先从候选和实际食物核对出FDC ID，再读详情。
const cached = await client.food(173424);
const candidate = normalizeFoodCandidate(cached, { grams: 150 });
// candidate依然待核验。确认适用条件后才能作为实际食物的营养参考。
```

CLI可通过 `--root /你的应用工作根目录` 指定独立缓存位置。`--out` 指定本地派生JSON；工具拒绝用它覆盖 catalog、sources、public 或 dist，公开营养仍需经项目审核、构建。CLI失败使用非零退出码，只打印不含凭据的概括信息；调用模块时也应避免记录请求配置或认证头。

## 与菜谱图鉴数据的关系

通用工具不自动写入 nutrition.status=reference，不自动增加已评估菜谱数，也不启动后续批次。审核与公开流程见 [NUTRITION.md](NUTRITION.md)。Mealora可在其受控同步或服务端流程复用此工具作USDA回退。图片匹配与营养匹配分别处理，没有可靠条件时保留未知。

查看本项目已发布的JSON或构建现有缓存不需要 USDA Key；访问 USDA API 时才需要私人 Key 或显式演示 Key，官方批量JSON导入也不需要Key。

## 品牌数据

```sh
npm run usda -- search '"PRESERVED DUCK EGGS"' --data-type Branded
npm run usda -- normalize sources/nutrition/usda/2442977.json --grams 100
```

`--data-type`只用于search，可选Branded、Foundation、SR Legacy或Survey (FNDDS)。不指定时保持原通用三类检索。品牌检索与普通检索独立缓存；候选输出包含生产商、品牌和GTIN，仍不自动批准菜谱匹配。模型解析会核对来源GTIN和生产商，完整来源保留品牌与配料表；同名不同品牌不可自动互换。
