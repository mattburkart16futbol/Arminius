import definitions from "./usda-nutrients.json";

export type USDAFoodFacts = Record<string, number>;
export type USDAFood = { id: number; name: string; unit: string };
export const usdaNutrients = definitions as USDAFood[];
export const usdaNutrientById = new Map(
  usdaNutrients.map((nutrient) => [String(nutrient.id), nutrient]),
);

const fixedMetricIds = new Set([
  "1003",
  "1004",
  "1005",
  "1008",
  "1079",
  "1092",
  "1093",
  "1258",
  "2000",
  "1063",
  "2047",
  "2048",
]);

export function additionalFoodNutrients(values: USDAFoodFacts) {
  return Object.entries(values)
    .filter(
      ([id, amount]) => !fixedMetricIds.has(id) && Number.isFinite(amount),
    )
    .flatMap(([id, amount]) => {
      const definition = usdaNutrientById.get(id);
      return definition && definition.unit ? [{ ...definition, amount }] : [];
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        String(a.id).localeCompare(String(b.id)),
    );
}

export const dashboardNutrientIds = [
  1087, 1089, 1090, 1091, 1095, 1106, 1114, 1162, 1165, 1166, 1167, 1175, 1177,
  1178, 1180, 1185, 1190, 1253,
] as const;

export function averageMicronutrients(
  meals: { id: string; eaten_at: string }[],
  items: { meal_id: string; nutrient_values?: USDAFoodFacts }[],
) {
  const dayForMeal = new Map(
    meals.map((meal) => {
      const date = new Date(meal.eaten_at);
      return [
        meal.id,
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      ];
    }),
  );
  const byDay = new Map<string, USDAFoodFacts[]>();
  for (const item of items) {
    const day = dayForMeal.get(item.meal_id);
    if (!day) continue;
    const rows = byDay.get(day) ?? [];
    rows.push(item.nutrient_values ?? {});
    byDay.set(day, rows);
  }
  const days = [...byDay.values()];
  return dashboardNutrientIds.flatMap((id) => {
    const completeDays = days.flatMap((rows) => {
      const values = rows.map((row) => row[String(id)]);
      return values.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
        ? [values.reduce<number>((sum, value) => sum + (value ?? 0), 0)]
        : [];
    });
    const nutrient = usdaNutrientById.get(String(id));
    if (!nutrient) return [];
    return [
      {
        ...nutrient,
        id,
        average: completeDays.length
          ? completeDays.reduce((sum, value) => sum + value, 0) /
            completeDays.length
          : null,
        completeDays: completeDays.length,
        loggedDays: days.length,
      },
    ];
  });
}

