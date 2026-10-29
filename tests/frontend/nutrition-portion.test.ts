import { expect, it } from "vitest";
import { nutritionForGrams } from "@/lib/nutrition-portion";

it("按可食克数换算四项营养，缺失独立保留null，真实0仍为0", () => {
  const portion = nutritionForGrams(
    {
      energy_kcal: 81.996,
      protein_g: 4.50596,
      carbohydrate_g: null,
      fat_g: 0,
    },
    150,
  );
  expect(portion?.energy_kcal).toBeCloseTo(122.994, 8);
  expect(portion?.protein_g).toBeCloseTo(6.75894, 8);
  expect(portion?.carbohydrate_g).toBeNull();
  expect(portion?.fat_g).toBe(0);
  const result = nutritionForGrams(
    { energy_kcal: 100, protein_g: 10, carbohydrate_g: 1, fat_g: 0 },
    12.5,
  );
  expect(result?.energy_kcal).toBe(12.5);
});

it("空值、非正数、无限与计算溢出不输出虚构的营养结果", () => {
  const values = {
    energy_kcal: 900,
    protein_g: 0,
    carbohydrate_g: null,
    fat_g: 100,
  };
  for (const grams of [NaN, 0, -1, Infinity, Number.MAX_VALUE])
    expect(nutritionForGrams(values, grams)).toBeNull();
});
