import { ExternalLink } from "lucide-react";
import { safeExternalURL } from "@/lib/catalog";
import type { Artwork, NutritionReference } from "@/lib/catalog";

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
}: {
  nutrition: NutritionReference;
  qualified?: boolean;
  recipeName?: string;
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
      {nutrition.scope && <p className="detail-scope">{nutrition.scope}</p>}
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
    </section>
  );
}

export function NutritionPanel({ item }: { item: Artwork }) {
  const defaultAvailable = hasReference(item.nutrition);
  const profiles =
    item.nutrition_profiles?.filter(
      (profile) =>
        profile.review_status === "approved" &&
        hasReference(profile) &&
        (!defaultAvailable || profile.id !== item.nutrition.profile_id),
    ) ?? [];
  return (
    <div className="nutrition-panel">
      {defaultAvailable ? (
        <ReferenceValues nutrition={item.nutrition} />
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
