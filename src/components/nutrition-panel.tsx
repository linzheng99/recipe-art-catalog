import { useId, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { safeExternalURL } from "@/lib/catalog";
import type { Artwork, NutritionReference } from "@/lib/catalog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { nutritionForGrams } from "@/lib/nutrition-portion";

function hasReference(nutrition: NutritionReference) {
  return (
    nutrition.status === "reference" &&
    nutrition.basis === "per_100g" &&
    nutrition.review_status !== "pending" &&
    Object.values(nutrition.per_100g).some((value) => value !== null)
  );
}

function ReferenceValues({
  nutrition,
  qualified = false,
  recipeName,
  grams,
}: {
  nutrition: NutritionReference;
  qualified?: boolean;
  recipeName?: string;
  grams: number;
}) {
  const estimated = ["usda_recipe_estimate", "recipe_estimate"].includes(
    nutrition.method ?? "",
  );
  const title =
    nutrition.estimation_level === "food_group_proxy"
      ? "营养参考（同类食物估算）"
      : estimated
        ? "营养参考（配方估算）"
        : qualified
          ? "营养参考（限定做法）"
          : "营养参考";
  const sourceURL = safeExternalURL(nutrition.source?.url);
  const portion = nutritionForGrams(nutrition.per_100g, grams);
  const detailPath = nutrition.details?.path;
  const detailURL =
    detailPath &&
    /^assets\/nutrition\/[a-z0-9-]+\.[a-f0-9]{16}\.json$/.test(detailPath)
      ? detailPath
      : null;
  const fields = [
    ["energy_kcal", "热量", "kcal"],
    ["protein_g", "蛋白质", "g"],
    ["carbohydrate_g", "碳水化合物", "g"],
    ["fat_g", "脂肪", "g"],
  ] as const;
  return (
    <section className="nutrition-reference" aria-label={title}>
      <p className="nutrition-heading">{title}</p>
      <p className="nutrition-basis">
        每100g可食部分{qualified && recipeName ? ` · ${recipeName}` : ""}
      </p>
      <dl className="nutrition-values">
        {fields.map(([key, label, unit]) => {
          const value = nutrition.per_100g[key];
          const formatted =
            value === null
              ? "暂无数据"
              : key === "energy_kcal"
                ? `${estimated ? `约 ${value.toFixed(1)}` : value} kcal / 100 g`
                : `${value > 0 && value < 0.01 ? "<0.01" : value.toFixed(2)} ${unit}`;
          return (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{formatted}</dd>
            </div>
          );
        })}
      </dl>
      {grams !== 100 && portion && (
        <div
          className="nutrition-portion"
          aria-live="polite"
          aria-label={`${grams}g营养参考`}
        >
          <p>
            {grams}g 营养参考{estimated ? "（估算）" : ""}
          </p>
          <dl>
            {fields.map(([key, label, unit]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {portion[key] === null
                    ? "暂无数据"
                    : `${key === "energy_kcal" ? "约 " : ""}${portion[key] > 0 && portion[key] < 0.01 ? "<0.01" : portion[key].toFixed(key === "energy_kcal" ? 1 : 2)} ${unit}`}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {estimated ? (
        <div className="nutrition-limits">
          <p>
            家庭配方估算，非实测
            {nutrition.final_weight
              ? ` · 成品约${nutrition.final_weight.grams}g（${nutrition.final_weight.is_measured === true ? "实测" : "假设"}）`
              : ""}
          </p>
          {!!nutrition.match?.food_proxies?.length && (
            <p>
              同类代理：
              {nutrition.match.food_proxies
                .map((p) => `${p.target} → ${p.reference_name}`)
                .join("；")}
            </p>
          )}
          {nutrition.match?.brand && <p>限定品牌：{nutrition.match.brand}</p>}
        </div>
      ) : (
        nutrition.scope && <p className="detail-scope">{nutrition.scope}</p>
      )}
      <details className="nutrition-explanation">
        <summary>
          数据与估算依据
          <ChevronDown aria-hidden="true" />
        </summary>
        {estimated && nutrition.scope && (
          <p className="detail-scope">{nutrition.scope}</p>
        )}
        {nutrition.source && (
          <p className="nutrition-version">
            来源版本：{nutrition.source.version}
          </p>
        )}
        {sourceURL && (
          <a
            className="nutrition-source"
            href={sourceURL}
            target="_blank"
            rel="noopener noreferrer"
          >
            营养参考来源
            <ExternalLink aria-hidden="true" />
          </a>
        )}
        {detailURL && (
          <a
            className="nutrition-source"
            href={detailURL}
            target="_blank"
            rel="noopener noreferrer"
          >
            完整营养依据（JSON）
            <ExternalLink aria-hidden="true" />
          </a>
        )}
      </details>
    </section>
  );
}

export function NutritionPanel({ item }: { item: Artwork }) {
  const inputId = useId();
  const [amount, setAmount] = useState("100");
  const grams = amount.trim() ? Number(amount) : NaN;
  const defaultAvailable = hasReference(item.nutrition);
  const defaultProfile = item.nutrition_profiles?.find(
    (profile) =>
      profile.id === item.nutrition.profile_id &&
      profile.review_status === "approved",
  );
  const defaultNutrition = {
    ...item.nutrition,
    final_weight: item.nutrition.final_weight ?? defaultProfile?.final_weight,
    match: item.nutrition.match ?? defaultProfile?.match,
    details: item.nutrition.details ?? defaultProfile?.details,
  };
  const profiles =
    item.nutrition_profiles?.filter(
      (profile) =>
        profile.review_status === "approved" &&
        hasReference(profile) &&
        (!defaultAvailable || profile.id !== item.nutrition.profile_id),
    ) ?? [];
  const valid =
    Number.isFinite(grams) &&
    grams > 0 &&
    [item.nutrition, ...profiles]
      .filter(hasReference)
      .every(
        (nutrition) => nutritionForGrams(nutrition.per_100g, grams) !== null,
      );
  return (
    <div className="nutrition-panel">
      {(defaultAvailable || profiles.length > 0) && (
        <div className="nutrition-amount">
          <label htmlFor={inputId}>食用量</label>
          <div className="nutrition-amount-input">
            <Input
              id={inputId}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              aria-invalid={!valid}
              aria-describedby={`${inputId}-help`}
              onChange={(event) => setAmount(event.target.value)}
            />
            <span>g</span>
          </div>
          <div className="nutrition-presets">
            {[100, 150, 200].map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={grams === value ? "secondary" : "ghost"}
                aria-pressed={grams === value}
                onClick={() => setAmount(String(value))}
              >
                {value}g
              </Button>
            ))}
          </div>
          <p
            id={`${inputId}-help`}
            className="nutrition-amount-help"
            role={!valid ? "alert" : undefined}
          >
            {valid
              ? "按成品可食重量换算，以下基准均为每100g。"
              : "请输入大于0且可计算的有效克数。"}
          </p>
        </div>
      )}
      {defaultAvailable ? (
        <ReferenceValues
          nutrition={defaultNutrition}
          grams={valid ? grams : NaN}
        />
      ) : profiles.length > 0 ? (
        <p className="nutrition-notice">
          暂无通用默认参考，以下数据仅适用于注明的做法。
        </p>
      ) : (
        <div className="nutrition-empty">
          <p>营养参考</p>
          <p>暂缺可靠数据</p>
        </div>
      )}
      {profiles.map((profile) => (
        <ReferenceValues
          key={profile.id}
          nutrition={profile}
          grams={valid ? grams : NaN}
          qualified
          recipeName={
            item.reference_recipes.find(
              (recipe) => recipe.id === profile.recipe_id,
            )?.name
          }
        />
      ))}
    </div>
  );
}
