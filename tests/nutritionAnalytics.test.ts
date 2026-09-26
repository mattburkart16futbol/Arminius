import { describe, expect, it } from "vitest";
import {
  aggregateDailyNutrition,
  averageNutrition,
  macroCalorieShares,
  targetAdherence,
} from "../src/lib/nutritionAnalytics";

describe("nutrition analytics", () => {
  const meals = [
    { id: "m1", eaten_at: "2026-09-25T12:00:00Z" },
    { id: "m2", eaten_at: "2026-09-25T19:00:00Z" },
  ];

  it("aggregates daily calories and macros", () => {
    const days = aggregateDailyNutrition(meals, [
      {
        id: "i1",
        meal_id: "m1",
        calories: 500,
        protein_g: 40,
        carbs_g: 50,
        fat_g: 15,
        fiber_g: 8,
        sugar_g: 10,
        saturated_fat_g: 4,
        sodium_mg: 700,
        potassium_mg: 900,
      },
      {
        id: "i2",
        meal_id: "m2",
        calories: 700,
        protein_g: 60,
        carbs_g: 40,
        fat_g: 25,
        fiber_g: 12,
        sugar_g: 5,
        saturated_fat_g: 6,
        sodium_mg: 800,
        potassium_mg: 1100,
      },
    ]);

    expect(days).toHaveLength(1);
    expect(days[0].calories).toBe(1200);
    expect(days[0].protein_g).toBe(100);
    expect(days[0].fiber_g).toBe(20);
    expect(days[0].potassium_mg).toBe(2000);
  });

  it("does not treat missing optional nutrients as zero", () => {
    const days = aggregateDailyNutrition(meals, [
      {
        id: "i1",
        meal_id: "m1",
        calories: 500,
        protein_g: 40,
        carbs_g: 50,
        fat_g: 15,
        fiber_g: 8,
        sugar_g: null,
        saturated_fat_g: null,
        sodium_mg: 700,
        potassium_mg: 900,
      },
      {
        id: "i2",
        meal_id: "m2",
        calories: 700,
        protein_g: 60,
        carbs_g: 40,
        fat_g: 25,
        fiber_g: null,
        sugar_g: null,
        saturated_fat_g: null,
        sodium_mg: 800,
        potassium_mg: 1100,
      },
    ]);

    expect(days[0].fiber_g).toBeNull();
    expect(days[0].coverage.fiber_g).toBe(0.5);
    expect(averageNutrition(days).fiber_g).toBeNull();
  });

  it("computes target adherence according to target direction", () => {
    const days = [
      {
        date: "2026-09-25",
        itemCount: 1,
        calories: 2000,
        protein_g: 150,
        carbs_g: 150,
        fat_g: 70,
        fiber_g: 30,
        sugar_g: 30,
        saturated_fat_g: 15,
        sodium_mg: 1800,
        potassium_mg: 3500,
        coverage: {
          fiber_g: 1,
          sugar_g: 1,
          saturated_fat_g: 1,
          sodium_mg: 1,
          potassium_mg: 1,
        },
      },
    ];

    const result = targetAdherence(days, [
      {
        metric: "protein_g",
        target_value: 140,
        period: "daily",
        direction: "minimum",
      },
      {
        metric: "sodium_mg",
        target_value: 2300,
        period: "daily",
        direction: "maximum",
      },
      {
        metric: "calories",
        target_value: 2100,
        period: "daily",
        direction: "target",
      },
    ]);

    expect(result.protein_g?.rate).toBe(1);
    expect(result.sodium_mg?.rate).toBe(1);
    expect(result.calories?.rate).toBe(1);
  });

  it("calculates macro calorie shares deterministically", () => {
    const shares = macroCalorieShares({
      protein_g: 100,
      carbs_g: 100,
      fat_g: 50,
    });
    expect(shares.protein).toBeCloseTo(400 / 1250);
    expect(shares.carbs).toBeCloseTo(400 / 1250);
    expect(shares.fat).toBeCloseTo(450 / 1250);
  });
});
