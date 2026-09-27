export type NutritionMetric =
  | "calories"
  | "protein_g"
  | "carbs_g"
  | "fat_g"
  | "fiber_g"
  | "sugar_g"
  | "saturated_fat_g"
  | "sodium_mg"
  | "potassium_mg";

export type NutritionMeal = {
  id: string;
  eaten_at: string;
};

export type NutritionMealItem = {
  id: string;
  meal_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
};

export type NutritionTarget = {
  metric: string;
  target_value: number;
  period: "daily" | "weekly" | "milestone";
  direction?: "minimum" | "maximum" | "target";
};

export type DailyNutrition = {
  date: string;
  itemCount: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  coverage: Record<
    "fiber_g" | "sugar_g" | "saturated_fat_g" | "sodium_mg" | "potassium_mg",
    number
  >;
};

const optionalMetrics = [
  "fiber_g",
  "sugar_g",
  "saturated_fat_g",
  "sodium_mg",
  "potassium_mg",
] as const;

function localDateKey(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function aggregateDailyNutrition(
  meals: NutritionMeal[],
  items: NutritionMealItem[],
): DailyNutrition[] {
  const mealDates = new Map(
    meals.map((meal) => [meal.id, localDateKey(meal.eaten_at)]),
  );
  const grouped = new Map<string, NutritionMealItem[]>();

  for (const item of items) {
    const date = mealDates.get(item.meal_id);
    if (!date) continue;
    const rows = grouped.get(date) ?? [];
    rows.push(item);
    grouped.set(date, rows);
  }

  return [...grouped.entries()]
    .map(([date, rows]) => {
      const optional = Object.fromEntries(
        optionalMetrics.map((metric) => {
          const known = rows.filter(
            (row) =>
              typeof row[metric] === "number" && Number.isFinite(row[metric]),
          );
          return [
            metric,
            {
              value:
                known.length === rows.length && rows.length > 0
                  ? known.reduce((sum, row) => sum + (row[metric] ?? 0), 0)
                  : null,
              coverage: rows.length > 0 ? known.length / rows.length : 0,
            },
          ];
        }),
      ) as Record<
        (typeof optionalMetrics)[number],
        { value: number | null; coverage: number }
      >;

      return {
        date,
        itemCount: rows.length,
        calories: rows.reduce((sum, row) => sum + row.calories, 0),
        protein_g: rows.reduce((sum, row) => sum + row.protein_g, 0),
        carbs_g: rows.reduce((sum, row) => sum + row.carbs_g, 0),
        fat_g: rows.reduce((sum, row) => sum + row.fat_g, 0),
        fiber_g: optional.fiber_g.value,
        sugar_g: optional.sugar_g.value,
        saturated_fat_g: optional.saturated_fat_g.value,
        sodium_mg: optional.sodium_mg.value,
        potassium_mg: optional.potassium_mg.value,
        coverage: {
          fiber_g: optional.fiber_g.coverage,
          sugar_g: optional.sugar_g.coverage,
          saturated_fat_g: optional.saturated_fat_g.coverage,
          sodium_mg: optional.sodium_mg.coverage,
          potassium_mg: optional.potassium_mg.coverage,
        },
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function averageNutrition(days: DailyNutrition[]) {
  function average(metric: NutritionMetric) {
    const values = days
      .map((day) => day[metric])
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  return {
    calories: average("calories"),
    protein_g: average("protein_g"),
    carbs_g: average("carbs_g"),
    fat_g: average("fat_g"),
    fiber_g: average("fiber_g"),
    sugar_g: average("sugar_g"),
    saturated_fat_g: average("saturated_fat_g"),
    sodium_mg: average("sodium_mg"),
    potassium_mg: average("potassium_mg"),
    loggedDays: days.length,
  };
}

export function macroCalorieShares(day: {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}) {
  const proteinCalories = day.protein_g * 4;
  const carbCalories = day.carbs_g * 4;
  const fatCalories = day.fat_g * 9;
  const macroCalories = proteinCalories + carbCalories + fatCalories;

  if (macroCalories <= 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  return {
    protein: proteinCalories / macroCalories,
    carbs: carbCalories / macroCalories,
    fat: fatCalories / macroCalories,
  };
}

export function targetAdherence(
  days: DailyNutrition[],
  targets: NutritionTarget[],
) {
  const dailyTargets = targets.filter((target) => target.period === "daily");
  const result: Partial<
    Record<
      NutritionMetric,
      { successfulDays: number; eligibleDays: number; rate: number | null }
    >
  > = {};

  for (const target of dailyTargets) {
    if (
      ![
        "calories",
        "protein_g",
        "carbs_g",
        "fat_g",
        "fiber_g",
        "sugar_g",
        "saturated_fat_g",
        "sodium_mg",
        "potassium_mg",
      ].includes(target.metric)
    ) {
      continue;
    }

    const metric = target.metric as NutritionMetric;
    const eligible = days.filter((day) => typeof day[metric] === "number");
    let successes = 0;

    for (const day of eligible) {
      const value = day[metric] as number;
      const direction = target.direction ?? "target";
      const met =
        direction === "minimum"
          ? value >= target.target_value
          : direction === "maximum"
            ? value <= target.target_value
            : Math.abs(value - target.target_value) <=
              target.target_value * 0.1;
      if (met) successes += 1;
    }

    result[metric] = {
      successfulDays: successes,
      eligibleDays: eligible.length,
      rate: eligible.length > 0 ? successes / eligible.length : null,
    };
  }

  return result;
}

export function optionalMetricCoverage(
  days: DailyNutrition[],
  metric: keyof DailyNutrition["coverage"],
) {
  if (days.length === 0) return 0;
  return (
    days.reduce((sum, day) => sum + day.coverage[metric] * day.itemCount, 0) /
    days.reduce((sum, day) => sum + day.itemCount, 0)
  );
}
