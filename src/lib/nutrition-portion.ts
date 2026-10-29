import type { NutritionReference } from "./catalog";

export function nutritionForGrams(
  values: NutritionReference["per_100g"],
  grams: number,
): NutritionReference["per_100g"] | null {
  if (!Number.isFinite(grams) || grams <= 0) return null;
  const result = { ...values };
  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    const value = values[key];
    if (value !== null && (!Number.isFinite(value) || value < 0)) return null;
    const portion = value === null ? null : value * (grams / 100);
    if (portion !== null && !Number.isFinite(portion)) return null;
    result[key] = portion;
  }
  return result;
}
