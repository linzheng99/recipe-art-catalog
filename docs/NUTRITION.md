# 营养参考：分批生成与接入

## 发布与线上验收

GitHub Actions在构建检查通过后，以本次push的before提交（PR用base提交，手动运行默认HEAD^）对比生成营养变化摘要，并写入作业摘要和部署文件 `nutrition/changes.json`。记录from_version、to_version、commit、增改删数量及逐篇前后方案，包含数值、来源和适用范围变化；普通页面修改不会冒充营养数据更新。初次发布没有旧营养文件时记录全部新增。

本地可运行 `npm run nutrition:changes -- --base-ref HEAD --out .cache/nutrition/changes.json`，或把HEAD替换为明确提交SHA。该命令仅读取Git与构建数据，不修改营养源资料。不要将不可信文本拼接为shell命令。

部署成功后，Actions自动检查线上manifest版本、轻量入口摘要、完整入口及全部菜谱投影，并抽检直接参考、USDA配方、代理配方、MEXT、KRDA、同图不同配方的详情SHA-256。github.io站点同时验证公开JSON跨域响应。传播延迟按2/4/8/16秒有界重试，失败使工作流失败；已部署产物不会被校验脚本自动回滚或覆盖。

本地验收：`npm run nutrition:verify -- https://linzheng99.github.io/recipe-art-catalog/ --changes`。它核对线上是否与当前本地版本相同；未部署的本地修改会明确失败，不能把本地测试通过当作线上已更新。相关GitHub接口依据：[Pages部署Action](https://github.com/actions/deploy-pages)、[作业摘要](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary)。

原始任务和分批范围限定保存在 [任务原文](prompts/NUTRITION_TASK.md)；Key申请、验证和通用USDA数据处理工具见 [USDA_CLIENT.md](USDA_CLIENT.md)。

全部372篇均有可读取方案：7篇直接参考、365篇配方估算，其中21篇明确标记为同类食物代理粗估。待核验候选、缺少可用方案、请求失败和未评估均为0；这不表示每篇都找到了原食材或品牌的精确数据。原21项来源缺口保存在 `catalog/nutrition/reviews/exact-source-backlog.json`，继续用于提高精度。首批8篇保留原有方案，随后364篇分为batch-002至batch-017，每批24篇（最后4篇）。这些任务复用食材原始缓存，未重复请求每道菜共享的食材。

`sources/nutrition/usda/*.json`仅是原始响应证据，**不会复制到public或要求其他应用读取**。最终公开的是本项目依据固定菜谱、已核验食材来源和家庭份假设计算的汇总JSON。`nutrition/index.json`的每个 `recipes[]`记录兼容追加 `nutrition`：有且仅有一个已批准方案时直接带四项营养、scope、source、版本和详情地址；未知或存在多个方案时保持null数值，并用profile_ids供调用方选择。Mealora接入见 [直接取值和回退示例](MEALORA_INTEGRATION.md)。

分批工作单保存在 `catalog/nutrition/worklist.json`；其中原始食材文字通过固定Git blob SHA核对后提取。`catalog/nutrition/ingredients.json`维护显式的食材映射，未审核候选不会进入配方计算。`catalog/nutrition/plans/standard-families.json`保存逐篇标准配方；克数和用法由本项目明确设定，配方替换和省略在note与公开scope中披露，不声称完全复现原文或任意同名菜。`Codex`审核记录仅表示本项目的模型辅助核对，不代表人工签署。

维护者确认允许按正常用量估算后，糖拌西红柿采用显式标准配方：处理后番茄净量200g、白砂糖20g，冷拌后汁液全部食用，成品按质量守恒约220g。原菜谱的两颗整果约200g不被声称为处理后的实测净重。`recipe_basis=standardized_assumptions` 表示这是默认假设下的配方估算，不是实际成品测量；USDA生番茄作为去皮番茄的宏量营养近似，去皮和短时加热影响未校正。资料中保存默认量、成品重量依据与不确定性；实际糖量或汁液食用比例不同需重新计算。

同样允许为净可食重量、原文按“瓣/个”表示的份量、可选分支和调料量自主设定明确的标准。不能把“原文没写实测克数”一律当作缺少依据：先选定标准配方，并区分原文值、项目假设和USDA来源。调料直接按克定义时无需密度，也不能声称这些克数是原文ml的换算。

本批新增：

| 菜谱 | 标准及来源 | 每100g热量 |
| --- | --- | --- |
| 电饭煲蒸米饭 | FDC 168932短粒非强化白米熟饭，不加油糖酱；无需推算原文干米体积和吸水量 | 130 kcal |
| 凉拌黄瓜 | 带皮净黄瓜200g、蒜9g、白醋12g、酱油9g、香油6g、蚝油6g、白糖5g、盐0.6g，腌汁全食，冷拌成品约247.6g | 约50.8 kcal |
| 牛奶燕麦 | 已清水煮熟燕麦200g、3.25%全脂奶280g、已煎熟可食全蛋50g，整份约530g，之后不再加热或弃料 | 约77.5 kcal |

牛奶燕麦按**已烹熟的成分**建立标准，FDC 173905熟燕麦已包含其参考吸水量，FDC 173423煎蛋已包含其参考烹调脂肪，不另漏算或重复添加油。200g熟燕麦不是把原文40g干燕麦硬算成固定出成率；280g奶也不是把280ml当作280g。该方案是另一份明确的熟重标准早餐，不是原文干料版本的精确重现；实际熟重或用油不同需换算或换源。

维护者进一步明确要求成品重量也按2–3人家庭正常份量设定，不等待实测。两篇蒸蛋分别建立以下**家庭份情景估算**，保留此前缺依据的评估历史：

| 菜谱 | 家庭份默认原料（净可食克数） | 假设整份成品 | 每100g热量 |
| --- | --- | --- | --- |
| 蒸水蛋 | 净蛋液150g（约3枚蛋）、水225g、盐2g，无可选油酱 | 360g，供2–3人 | 约59.6 kcal |
| 鸡蛋羹 | 净蛋液150g、水200g、盐3g、香油3g、酱油9g，无其他可选调料 | 350g，供2–3人 | 约70.2 kcal |

360g和350g是本项目明确选定的家庭份情景参数，不是USDA数据、实测重量、统计平均或推算出的文献出成率。人数用于解释这份菜的大小，**不会决定每100g的数值**；每100g仍是整份营养除以明确假设的成品重再乘100。不能把整份营养直接标为每100g，也不能仅增加人数而不调整原料。

`final_weight.method=household_serving_assumption`、`basis=standard_recipe_assumption`、`is_measured=false`、`servings={min:2,max:3}` 标记这一类假设；`estimate_confidence=low` 表示缺实测出成率的情景估算。公开摘要也保留这些字段，使用方可选择接受该家庭份假设、用实际重量重算，或回退查询其他来源。两篇仍按不同recipe_id维护，共享插画的旧默认 `nutrition` 保持unknown。

两道蒸蛋的家庭份路径选择带盖蒸制、无过滤弃蛋液或弃汁、添加油酱全部食用的明确工艺。宏量营养暂按完全保留假设相加，`retention_correction=not_applied`，没有冒充已做烹饪损失校正；蒸发、凝结水和碗壁残留的影响都在不确定性中披露。实际成品克数、油酱或弃汁比例变化时重新计算。USDA“egg custard”检索中甜蛋奶羹、干粉及蛋奶派仍不匹配，家庭份方案改用真实鸡蛋、水、盐、油酱食材来源。

## 文件与版本

| 文件 | 用途 |
| --- | --- |
| `catalog/nutrition.json` | 兼容已有默认参考，保留玉米原始数值和来源记录 |
| `catalog/nutrition/profiles.json` | 按 recipe_id 保存独立营养方案、配方版本、适用条件和审核证据 |
| `catalog/nutrition/assessments.json` | 已评估条目的候选、结论及具体缺失依据 |
| `catalog/nutrition/batches/batch-001.json` | 首批 8 篇的检索任务；后续新建 batch-002 等 |
| `sources/nutrition/queries/` | USDA 原始搜索响应、请求参数、获取时间与摘要 |
| `sources/nutrition/usda/` | 显式选定 FDC ID 的原始详情或搜索结果原对象，以及来源与摘要 |
| `sources/nutrition/checkpoints/` | 按任务摘要保存候选生成检查点，可断点重跑 |
| `.cache/nutrition/` | 未跟踪的下载与 API 请求预算；不依赖该目录构建网站 |
| `catalog/NUTRITION_COVERAGE.md` | 构建生成的覆盖报告，不手工修改 |
| `public/nutrition/index.json` | 生成的营养索引，包含全部 372 篇逐篇状态和已批准方案摘要 |
| `public/assets/nutrition/*.json` | 按内容摘要命名的详细溯源和计算证据 |

公开文件由源资料构建，不直接编辑 public 或 dist。`npm ci && npm run build` 完全离线使用已提交的来源缓存，不需要 API Key。CI 也不在构建时访问 USDA。

主目录保持 schema_version=1，原有 `nutrition.status/basis/scope/per_100g/source` 不删除或改义；仅兼容追加 `nutrition_catalog`、`nutrition_profiles` 以及默认参考的审核、匹配和溯源字段。营养索引自身也采用 schema_version=1。既有 key、recipe_ids 和图片摘要地址保持不变。

每个方案由 `id + version + recipe_id + recipe_blob_sha` 标识，计算规则为 `nutrition-1.6.0`，兼容新增家庭份炒、煎、焖、炖、烘烤、微波及油炸的明确假设路径；旧来源数值不改写。`data_version` 纳入方案、原始来源摘要与规则版本。正文详情以 SHA-256 寻址；发布先写新详情、再写入口，保留旧摘要文件。单独的营养索引有自己的 version，目录也会随数据更新生成新 version。

家庭份热加工记录 `macronutrient_retention=assumed_full`，只汇总明确列入的食用部分，置信度为low。允许按正常份量设定成品保留油、裹粉及附着调味汁，不计算炸锅余油或未粘附粉浆。这些是项目假设，不是USDA吸油率或实测。酒料未做蒸发校正时明确保留全部已列酒料营养，可能高估热量。没有可用真实来源或已明确披露的同类代理时，未知项仍为null，不以0补齐。白灼虾的早期生料估算方案已撤回审核，改为明确的USDA熟虾参考；历史源记录和旧摘要仍保留。

继续分批的命令：

```sh
# 只有确有新食材查询时才联网；缓存成功项会跳过，遇到失败停在检查点。
node --env-file-if-exists=.env.local scripts/nutrition-ingredients.mjs --limit 24
# 标准配方改变时更新任务，再同步对应批次。仅检索，不自动批准候选。
node scripts/nutrition-prepare-batches.mjs
npm run nutrition:sync -- --batch batch-002 --limit 24
# 食材和逐篇方案明确核对后，生成源方案及评估记录；重复执行不新增同一方案。
node scripts/nutrition-plans.mjs
npm run build
```

更新已存在的方案时新增plan.version，显式撤回/替代旧审核并保存原因；生成器不会直接覆盖已有同ID方案。已完成的候选缓存可以离线复用，构建始终不需要Key或网络。

来源缓存的 `raw_sha256` 对 `JSON.stringify(response)` 计算，即解析后的原始JSON对象的确定序列，不是HTTP传输字节；保留原对象而不改写数值。官方食物营养量以每100g为基准，定义见 [USDA Download Field Descriptions](https://fdc.nal.usda.gov/portal-data/external/dataDictionary)。公开详情文件的 sha256 则校验完整文件字节。

## 配置与分批同步

1. 需要新查询时，把 `.env.example` 复制成未跟踪的 `.env.local`，配置 `FDC_API_KEY`。获取私人 Key 的入口见 [USDA 官方 API 指南](https://fdc.nal.usda.gov/api-guide/)。CI 同步可注入同名 Secret；不要使用 VITE_ 前缀。
2. 新建批次文件，明确 recipe_id 和检索词。图片名字相似不构成营养映射依据。
3. 运行分批命令。`--limit` 指本次最多处理几个未完成的菜谱任务；成功任务跳过，失败任务会重跑；重复查询复用同一原始响应缓存。

```sh
npm run nutrition:sync -- --batch batch-001 --limit 3
# 相同命令继续跑后面的任务，或重试先前失败的任务。
npm run nutrition:sync -- --batch batch-001 --limit 3
```

无私人 Key 的小样本探索可显式使用 `--demo`，这使用 USDA 官方文档公开的 DEMO_KEY，不是项目私密凭据。本批已缓存全部查询，重跑无需再次请求。

```sh
npm run nutrition:sync -- --batch batch-001 --limit 3 --demo
```

脚本不输出密钥、认证头、原始网络异常或带密钥的 URL。Key 仅在 Node 同步请求头内使用，不写入源数据、公开 JSON、快照或浏览器包。缺 Key 且无缓存时失败并保留检查点。

默认单通道、请求间隔 4 秒；网络超时为 20 秒，最多 4 次尝试，处理 429/5xx 和 Retry-After，长于 60 秒的重试提示留待下次运行。持久化本地预算上限：私人 Key 900 次/小时，DEMO_KEY 30 次/小时、50 次/天。预算按本机请求计数，其他用户或同 IP 用量可能更早触发上游限制，仍以 HTTP 429 为准。不要并行运行多个同步进程。

失败只写任务失败状态，不改变已缓存成功响应或已批准方案。退出码非零表示存在待重试任务。后续批次沿用同一缓存，不因批次变化重新请求已有数据。

## 选择候选、缓存与无 Key 导入

检索返回前 20 个结果只用于发现候选；排序靠前不代表匹配。需要审阅食物种类、部位、熟度、工艺、可食部分、油糖酱料、品牌、适用配方和排除条件，显式选择 FDC ID。

如果搜索响应已经包含所需四项营养，可导入其未改写的食物原对象，保存父响应摘要，避免重复请求详情：

```sh
node scripts/nutrition-sync.mjs --import-search 170457,169655
# 确实需要详情时才请求，已有缓存会跳过。
npm run nutrition:sync -- --food 169999 --demo
```

首批后续详情请求曾遇到 HTTP 429，已使用先前完整搜索响应中的真实营养数据导入所选候选，没有绕过配额、重复请求或补造数值。仅已批准方案进入公开可用数据，导入本身不等于批准。

也可不使用 API：从[官方批量页面](https://fdc.nal.usda.gov/download-datasets/)下载 JSON 压缩包并解压，随后离线导入显式选择的 ID。例如官方 SR Legacy 包：

```sh
node scripts/nutrition-import.mjs \
  --file /你的目录/FoodData_Central_sr_legacy_food_json_2018-04.json \
  --ids 169999,173424 \
  --dataset-url https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip \
  --release SR-Legacy-2018-04
```

以解压后实际文件名为准。导入记录官方 URL、发行版、获取时间、整个 JSON 文件摘要和逐食物对象摘要，已存在记录保持不变。原始大包可保留在 .cache；构建只需要被方案引用的已提交食物快照。

## 审核及计算规则

- `review.status=pending` 不进入可用参考；只有 `approved` 且可追溯到固定配方、来源和审核证据的方案才发布。
- `Codex evidence review` 是本项目模型辅助的证据核对，明确不声称 USDA 审核或已获人工签署。维护者可审阅源记录再批准后续批次。
- `method=usda_direct`：直接使用匹配后的成品或食物条目每 100g 可食部分营养。不能从每颗、整根或毛重推定食用克数。
- `method=usda_recipe_estimate`：逐食材每100g营养 × 净可食克数 /100 后求和，再除以有依据的成品可食总重量 ×100。`calculation.total` 为整份，`per_100g` 为每100g，二者明确区分。
- 食材须显式声明生熟状态、营养基准、可食量及依据。ml 必须附带密度、来源 URL、版本和适用条件；不能统一当作g。
- 成品重量支持有来源版本的实测、已发表出成率、**称重后不再加热、无丢弃且全部食用的冷拌/熟食组装**质量守恒，以及明确标为非实测的家庭份蒸制、炒煎、炖煮、烘烤等情景假设。不能把家庭份情景伪装成实测，或把热加工原料总重自动作为成品重。
- 无后续加热的熟食组装使用USDA对应熟食数据及熟重；家庭份蒸制、炒煎、炖煮和烘烤允许真实原料数据加上明确的宏量营养保留假设，必须同时披露低置信度、非实测成品重和未校正烹饪损失。油炸使用 `deep_fry`，必须记录 `oil_is_retained_portion=true`、`assumed_retained_oil_g` 与 `breading_is_retained_portion=true`；油食材的 `quantity.role=retained_frying_oil` 合计须等于该假设。弃掉的油、裹粉或卤汁不作为计算输入，附着食用的部分单独列克数；没有宣称做营养烹饪损失校正。
- 油、糖、酱料均要计入；可选项、区间取值及分支须明确，不能静默采用中点或省略。
- kcal、蛋白质g、碳水g、脂肪g 都逐项保留 null。某一食材该项未知，则整份及每100g的该项也未知；其他已知项可独立计算，完整度标为 partial，不冒充完整。
- 保留 USDA kcal，包括原始明确的0。4/4/9 只产出合理性检查，不反向改写原始能量值。
- 原始响应摘要、FDC ID、数据类型、发布版本和配方 blob SHA 变化时，旧审核不能直接沿用。

审核通过后运行：

```sh
npm run build
npm test
npm run check
# 如改动展示，再执行 npm run test:e2e。
```

现有有效参考若与新值冲突，构建会拒绝静默覆盖。更新时先另存新快照/方案版本、核对来源差异并记录依据，再显式迁移旧默认参考；旧来源和公开摘要文件保留。未审核候选不得写入原有默认 nutrition。当前同图多篇菜谱不设置共享默认营养，分别按 recipe_id 维护。

## 其他应用与 Mealora 接入

部署后入口为：

```text
https://linzheng99.github.io/recipe-art-catalog/manifest-lite.json
https://linzheng99.github.io/recipe-art-catalog/nutrition/index.json
```

本地修改尚未部署时，上述线上地址仍是旧版本；以本次 dist 预览或 public 文件验收。不要把 localhost 写死为生产目录。

```js
const manifestURL = 'https://linzheng99.github.io/recipe-art-catalog/manifest-lite.json';
const manifest = await fetch(manifestURL).then(r => {
  if (!r.ok) throw new Error('目录暂不可用');
  return r.json();
});
// 旧目录没有营养索引时，按“无可用参考”处理。
const descriptor = manifest.nutrition_catalog;
const indexURL = descriptor && new URL(descriptor.path, manifestURL);
const index = indexURL && await fetch(indexURL).then(r => {
  if (!r.ok) throw new Error('营养索引暂不可用');
  return r.json();
});
const candidates = index?.profiles.filter(p =>
  p.recipe_id === 'howtocook-7a681fba9fd0' && p.review_status === 'approved'
) ?? [];
// 接下来必须独立核对 recipe_blob_sha、match 各条件和 scope，再决定是否使用。
// 不是看到 candidates[0] 就自动命中。
```

真实示例 `egg-hard-boiled-branch-v1` 来自 FDC 173424：每100g为 **155kcal / 蛋白质12.58g / 碳水1.12g / 脂肪10.61g**。只适用原菜谱全熟10分钟分支的去壳鸡蛋、不加油糖酱，**不适用于流心分支**；因此该插画旧字段 `nutrition.status` 仍为 `unknown`。玉米 FDC 169999 原有 96kcal /3.41g /20.98g /1.5g 保持不变，仍需排除糯玉米和含芯称重。

`profiles[].details.path` 相对 manifestURL（或营养索引的站点根目录）解析，**不是相对 nutrition/index.json 的目录**；使用 `new URL(profile.details.path, manifestURL)`。先校验字节数与 SHA-256，再读取详情中的 source_records、review、assumptions 和 calculation。

Mealora 应保留两个独立结果：图片 key 与营养方案 ID。即使图片 key 相同，也要检查实际 recipe_id/配方版本、品种、生熟、做法、可食重量、品牌和配料是否符合 match。信息不足、版本不符、unknown、候选待核验、请求失败或无匹配时保持未知，转入自己的 USDA 查询/食材计算流程，不能借用邻近图片的营养。

USDA 回退应放在 Mealora 的服务端或受控同步流程：缓存按 FDC ID/数据版本或规范化查询标识，Key 置于服务端环境或 Secret，遵守限流、超时、失败重试。没有安全的服务端查询条件时保持未知或使用已同步的官方批量数据。获取到候选后仍要独立审核，不能将搜索第一项直接当作营养命中。

范围相符且每100g值已知后，某项摄入参考 = 该项每100g值 × 实际可食g /100；该项为 null 时结果仍为 null。所有结果均为参考或估算，不代表用户实际吃下的精确配方。

## 本轮全量评估及后续维护

目前372篇均有参考，其中21篇是同类食物代理粗估，原精确来源缺口另存精化待办。所有未发布数值的条目均有具体原因和下一步；状态完成不表示372篇都有营养数字。详细待办在 `catalog/nutrition/reviews/unresolved.json` 和生成的 `catalog/NUTRITION_COVERAGE.md`。

主要未解问题包括：特殊物种/部位尚无适用来源（黄鳝、鲜猪皮等）、腐竹及蒜苔等食材来源、酒酿发酵成品、品牌复配粉料与酒类标签。滤渣饮品缺成品或浸出参考；不能把被丢弃的全部原料直接计成喝下的营养。正常用量和2–3人家庭成品重量已允许设定，不再以未实测重量作为统一阻塞。

336份家庭标准计划保存在 `catalog/nutrition/plans/standard-families.json`，原始8篇方案另行保留。部分明确改为不弃汤、少油或自制调料的标准变体，所有省略替代在scope、match和assumptions披露；这些估算不代表原文所有分支或用户真实配方。含USDA品牌食材的方案保存生产商、品牌和GTIN，只作为限定方案，不设置插画通用默认营养。

食品原始响应在 `sources/nutrition/`，不进入浏览器构建。完整详情保留来源的数据类型、发布日期、获取日期和原始摘要。品牌标签取整可能导致热量与4/4/9折算不同，保留USDA值及校验提示，不反向凑数。

可复用命令：

```sh
# 只请求未完成且没有同条件缓存的食材查询。
npm run nutrition:ingredients -- --limit 24
# 在明确选择来源与审核家庭标准计划后，重建批次任务。
npm run nutrition:prepare
npm run nutrition:sync -- --batch batch-002 --limit 24
# 按批次生成已明确批准的标准计划；不自动从第一候选取值。
npm run nutrition:apply -- --batch batch-002
# 应用逐篇写好的缺项结论；已有可用方案始终优先，不会被旧待办覆盖。
npm run nutrition:review
npm run build
npm test
npm run check
npm run test:e2e
```

食材定义可用 `data_types: ["Branded"]` 单独检索品牌；默认仍检索SR Legacy、Foundation、FNDDS。数据类型参与缓存身份，相同词的品牌与通用搜索不混用。已完成的批次及食材重跑跳过，标准方案同ID不重复生成，缺项审核可重复应用且不改写原审核时间。

修改标准计划时递增version并显式撤回旧方案。白灼虾v1、雪花酥v1和炸鲜奶v1保留为撤回记录，已用新版本替代；不会继续出现在可用方案中。缺项解除后新增审核通过的方案，再构建，旧缺项文件不会覆盖它。

`nutrition/index.json` 的每篇记录新增 `review_status`、`blocker_code`、`next_action`、`evaluated_at`。`reference_available`表示有可用方案；`reviewed_without_reference`表示已核对但仍不可用于营养计算；具体业务状态继续读status。`no_match`只针对本轮候选，不宣称整个USDA没有数据。

轻量图片目录保留既有营养字段、值和默认方案ID，但家庭标准方案的scope为简要提示，默认方案不再重复列入nutrition_profiles。全部适用条件在 `nutrition/index.json` 和按需加载的recipe_details中；网站打开详情时验证摘要再还原完整说明。Mealora应以营养索引中的match为准，不能用轻量提示或图片key完成营养匹配。

## 2026-10-28 家庭份重评

本轮新增92篇可用估算，从236篇增至328篇（7篇直接参考、321篇配方估算）。剩余44篇为26篇缺食材/品牌来源和18篇本轮候选无合理匹配，不再以未实称成品重量或吸油量统一阻塞。初次136条缺项结论完整归档于 `catalog/nutrition/reviews/initial-2026-10-28.json`，当前待办在 `unresolved.json`，已解决条目的评估保留历史。

糖醋里脊示例：猪里脊净350g、保留淀粉50g、蛋液50g、食用保留油30g、糖30g、醋25g、番茄酱35g、酱油15g、盐2g、胡椒1g、水100g；假设成品600g，整份1075.11kcal，每100g179.185kcal。30g油是设定的留在食物中的量，不是炸锅投入量，实际吸油、裹粉和肉汁损失不同会改变结果。所有食材数值来自详情列出的真实USDA记录。

部分方案是明确的普通食材代理或自制版本，例如日本豆腐使用蛋液与豆奶组成的自制玉子豆腐、馄饨使用自制皮馅、海鲜使用注明的通用净肉代理。这些是限定家庭估算，不冒充原品种、原品牌或原配方；调用方须接受相应替换后使用。新增方案不设插画通用默认营养，Mealora从recipe_id对应方案读取。

## 多来源补齐（2026-10-28）

在此前328篇基础上新增16篇，当前344篇可用；本轮新增15篇MEXT+USDA混合估算，以及1篇USDA通用三层甜酒估算。剩余28篇均有具体待办（19篇缺依据、9篇本轮候选无合理匹配）。新增方案仅为限定家庭版本，不设置插画通用默认营养。

USDA优先。对已确认缺项的韭菜、蒜苔、长山药、干银耳、干湯葉、紫萁、蜜柑果肉、茭白、长叶莴苣及熟栗，使用[日本文部科学省官方成分表](https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html)。来源为八订增补2023年、2026-03-27正误更新的完整XLSX，保留在 `sources/nutrition/mext/datasets/`，按食品编号提取原始行至 `sources/nutrition/mext/*.json`。官方[复用说明](https://www.mext.go.jp/a_menu/syokuhinseibun/)要求注明出处，不能统称CC0。

离线同步与重跑，不需要Key、不修改官方XLSX：

```sh
node scripts/nutrition-composition.mjs \
  --file sources/nutrition/mext/datasets/composition-2023-20260327.xlsx \
  --ids 06207,06224,02023,08008,04060,06123,07029,06271,06316,05013
npm run nutrition:prepare
npm run nutrition:apply
npm run build
```

导入使用Python3标准库只读提取XLSX；项目构建和其他应用读取仍只需Node/浏览器。已存在同编号同摘要快照跳过；同编号来源改变时拒绝静默覆盖，须保存新版本并重新审核映射。完整原表、食品行、列标识、单元格坐标、原始字符串、数据集与行SHA-256均保留，构建检查原表摘要。库中的MEXT食材不进入USDA API检索，USDA已有查询继续复用缓存。

解析字段为ENERC_KCAL（kcal）、PROT-（g）、CHOCDF-（总碳水g）和FAT-（g），全部按100g可食部分；不混入氨基酸组成蛋白、可利用碳水或kJ。`Tr`（痕量）、`-`（未给值）保留null，来源明确的0保留0；括号数值保留并记录 `estimated_in_source=true`。日本表能量口径与USDA可能不同，原值不按4/4/9强改。

公开schema_version仍为1，已有USDA方案的method和值不变。新混合方案使用兼容新增的 `method=recipe_estimate`，`source.providers`列来源，`source.food_ids`给MEXT食品编号，`source.fdc_ids`仅含实际USDA编号；不把MEXT编号伪装成FDC ID。详情 `source_records[]`逐项保存来源与授权。Mealora仍读取 `recipes[].nutrition.per_100g`；使用严格method枚举或旧客户端副本时须更新以识别新增方法，不能将未知方法默认当作USDA。新版无依赖客户端已经支持混合来源。

韭菜炒蛋真实方案：韭菜净叶200g（MEXT06207）、蛋液200g、油20g、盐3g（USDA），成品重量假设360g。整份498.8kcal，每100g138.555556kcal、蛋白质7.944444g、碳水2.622222g、脂肪11.005556g。数据是注明来源的家庭估算，非原菜谱实测。

部分限定方案仍有明确替代：羊腿代理羊腩、未炸干湯葉代理腐竹、长叶莴苣叶代理油麦菜或莴笋叶、温州蜜柑与红茶的果茶版本。银耳按干重15g，与泡发后重量分开；长山药不默认等于铁棍品种。B52使用26.5%ABV咖啡甜酒、17%奶油甜酒和40%伏特加各20g，不点火；不是原品牌标签或原文每种10ml的换算。

台湾食药署整包下载在本次环境遇到域名解析失败，记录于 `sources/nutrition/checkpoints/external-sources.json`，尚未导入其数值；USDA菜谱批次未因此出现请求失败或覆盖旧值。MEXT甘酒16050是米麴甜饮，未当作中国糯米醪糟；魔芋精粉02002已发现，但代糖等其他配料仍待核验。当前待办在 `reviews/unresolved.json`，此前44篇结论保留于 `pre-multisource-2026-10-28.json`。


## 韩国年度成分DB补充（2026-10-28）

在344篇基础上新增7篇估算，当前351篇可用（7篇直接参考、344篇配方估算），剩余21篇（16篇缺依据、5篇无合理匹配）。新增响油鳝丝、葱油桂鱼、清蒸鳜鱼、田螺酿、昂刺鱼豆腐汤、鲜茶树菇版本的芹菜拌茶树菇及魔芋蛋糕，均不设置插画通用默认营养。先前28条待办归档在 `catalog/nutrition/reviews/pre-korea-2026-10-28.json`。

采用[韩国RDA年度国家标准食物成分DB](https://www.nics.go.kr/food/kfi/fct/fctIntro/list)的Excel，实际工作表为 `국가표준식품성분 Database 10.4`。官方区分年度Excel（KOGL第1类、署名）和书籍PDF（第2类、非商业）；本项目使用年度Excel，不导入书籍PDF。下载表单只填写实际用途“应用/网页开发”和职业类别Other，不需要API Key。`sources/nutrition/krda/dataset.json`保存下载端点、表单字段、原表版本、SHA-256及出处；完整原表与食品原始行分别保存在 `datasets/composition-10.4.xlsx` 和 `*.json`。

```sh
node scripts/nutrition-krda.mjs \
  --file sources/nutrition/krda/datasets/composition-10.4.xlsx \
  --ids K0600000000a,K1240000000a,K4190010000a,G0100000000a,K6340000000a,K0580000000a
npm run nutrition:prepare
# 仅当批次食材变化时重跑对应批次，先复用已有缓存
npm run nutrition:sync -- --batch batch-002
npm run nutrition:apply
npm run nutrition:review
npm run build
npm test
npm run check
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

只读提取器使用Python3标准库，按附录食品码连接DB10.4索引、食品名、英文名和学名；不把工作表行号当食品码。核对每100g可食部基准，以及F/H/K/I列的热量kcal、蛋白质g、总碳水g和脂肪g。缺值独立保留null；来源明确的0可使用。来源能量保持原样，不以4/4/9强制改写。导入前校验所有选中行，同版同摘要重跑跳过，损坏下载或不存在的食品码不覆盖既有成功记录；构建再次核对完整XLSX摘要。

`provider=krda`与12位食品码独立存储，不伪造FDC ID。方法沿用 `recipe_estimate`，规则版本升至 `nutrition-1.5.0`；原USDA数值不变，规则版本升级会更新数据摘要。Mealora仍取 `recipes[].nutrition.per_100g`，客户端已支持 `source.food_ids[].provider=krda`。单项详情的 `source_records` 包含学名、原始行/单元格、原始机构标记、版本与获取日期。

匹配边界：黄鳝为Monopterus albus，田螺为Cipangopaludina chinensis malleata；鳜鱼采用Siniperca scherzeri斑鳜同属代理，明确不等同Siniperca chuatsi的实测数据；茶树菇采用鲜Agrocybe cylindracea自制版本，不能当作原文闽星瓶装制品。韩国鲜刺参条目也已缓存，但与原文泡发北极参的物种和含水状态不同，未批准为葱烧海参的数值。中国官方黄鳝、鳜鱼、鸭血、菜心条目已记录为外部检索结果，本轮未把未导入的候选算作可用营养。


魔芋蛋糕另补MEXT纯魔芋精粉02002、USDA纯塔塔粉175041，以及NOW纯赤藓糖醇2386683（GTIN733739069276，生产商Now Health Group Inc.）。官网同UPC配料仅赤藓糖醇，当前份量10g，USDA历史份量8g；四项统一到每100g一致，仍保留USDA2022-12-22原始数值及快照。配方固定全蛋液150g、代糖50g、可可10g、魔芋精粉10g、塔塔粉1g，烤后190g是假设。赤藓糖醇总碳水100g/100g、来源能量0kcal；总碳水包含糖醇，不代表净碳水，不用4/4/9强行增加其热量。已核验官方资料见方案审核证据。

昂刺鱼豆腐汤选择黄颡鱼Pseudobagrus fulvidraco（KRDA K0580000000a），不用于原文可选沙光鱼。鱼净肉250g、豆腐200g、汤水及调料按2–3人份明确设定，成品1300g非实测；全部鱼肉豆腐及汤汁食用，不把鱼骨重量计入。已解决条目的历史记录仍保存在评估history中；实际剩余21项以生成覆盖报告为准。


## 同类食物代理与家庭粗估（2026-10-29）

维护者明确允许用同类通用食物补全剩余菜谱，不以精确物种、品牌或复配标签作为粗估方案的统一阻塞。本轮新增21篇，合计372篇有可读值；原351篇各项营养数值保持不变。21篇不是原配方的精确匹配，`estimation_level=food_group_proxy` 与 `match.identity_precision=food_group_proxy` 标明精度，`match.food_proxies[]`保存原食物、实际代理食物、真实FDC/官方食品码和替代理由。

来源仍取真实USDA、MEXT及KRDA缓存。鱼类按去骨可食肉量，用同类淡水鱼肉代理；海参、血类、血肠、皮肉及熟叶菜采用明示的同类食品；粉料、汤液和复配菜固定为明确的通用家庭模型。模型中的克数与组成是估算假设，不称为厂家配方、测定比例、过滤提取率、晒干出成率或烹饪保留率。龟苓膏粉的淀粉/琼脂模型、冰粉无糖基底、酸梅汤的果汁稀释模型等，在scope、assumptions及代理记录中说明。未经匹配的精确原食材来源仍可保持未知；本批提供的是可选粗估方案。

这些方案不作为插画默认营养，原有unknown默认保留；按recipe_id读取 `recipes[].nutrition` 能直接取得代理结果。页面标题为“营养参考（同类食物估算）”，不增加许可提示。按正常食用克数换算时，代理标记也随客户端结果返回。对浓缩火锅底料按实际使用的底料克数计算，不将整锅或稀释汤重量冒充底料。

历史21条缺项结论归档 `reviews/pre-generic-proxies-2026-10-29.json`；后续寻找原物种、品牌与发酵/提取数据的任务在 `reviews/exact-source-backlog.json`，不是尚无可用营养。`reviews/unresolved.json`只保留尚无参考方案的条目，本轮为空。原缺项还保存在逐篇assessment.history中。

生成步骤仍是 `npm run nutrition:prepare` → 同步变化批次（全部已缓存时不发网络请求）→ `npm run nutrition:apply` → `npm run nutrition:review` → `npm run build`。同版本已有方案重跑跳过；未来拿到更精确资料时新建plan.version并显式撤回旧方案，不覆盖历史。规则版本为nutrition-1.6.0，schema_version仍为1，稳定key、recipe_ids、图片地址及读取字段不变。

轻量目录仅保留精度标记、每100g和来源摘要；scope简写为“见详情”或“代理估算，见详情”，完整限制随按需正文和nutrition/index.json读取。保持768KiB预算，不删除历史字段，也不将未知数据补0。单独营养索引的 `reference_quality` 给出21篇food_group_proxy与351篇other_available；后者不表示全部为原配方实测。
