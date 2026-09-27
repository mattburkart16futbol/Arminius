export const nutrients = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "sugar_g",
  "saturated_fat_g",
  "sodium_mg",
  "potassium_mg",
] as const;
export type Nutrient = (typeof nutrients)[number];
export type NutrientValues = Record<Nutrient, number | null> & {
  nutrient_values?: Record<string, number>;
};
export type Provenance = {
  source: string;
  source_id?: string | null;
  url?: string | null;
  release?: string | null;
  data_type?: string | null;
};
export type Food = NutrientValues & {
  id: string;
  name: string;
  brand: string | null;
  gtin_upc: string | null;
  serving_grams: number;
  portions: { label: string; grams: number }[];
  nutrient_values: Record<string, number>;
  source: string;
  source_id: string | null;
  source_url: string | null;
  source_release: string | null;
  source_data_type: string | null;
};
export type MealRecord = {
  id: string;
  name: string;
  eaten_at: string;
  revision: number;
};
export type MealItem = NutrientValues & {
  id: string;
  meal_id: string;
  food_id: string | null;
  name: string;
  quantity_grams: number;
  source_snapshot: Provenance | null;
  nutrient_values?: Record<string, number>;
};
export type DraftFood = {
  key: string;
  name: string;
  foodId?: string;
  snapshotId?: string;
  grams: string;
  baseGrams: number;
  values: NutrientValues;
  source: Provenance | null;
};
export function localDateTime(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function scaleNutrients(
  values: NutrientValues,
  fromGrams: number,
  toGrams: number,
): NutrientValues {
  if (
    !Number.isFinite(fromGrams) ||
    fromGrams <= 0 ||
    !Number.isFinite(toGrams) ||
    toGrams <= 0 ||
    toGrams > 100000
  )
    throw new Error("Enter a portion between 0 and 100,000 grams.");
  return Object.fromEntries([
    ...nutrients.map((n) => [
      n,
      values[n] === null
        ? null
        : Number(((values[n]! * toGrams) / fromGrams).toFixed(6)),
    ]),
    [
      "nutrient_values",
      Object.fromEntries(
        Object.entries(values.nutrient_values ?? {}).map(([id, amount]) => [
          id,
          Number(((amount * toGrams) / fromGrams).toFixed(6)),
        ]),
      ),
    ],
  ]) as NutrientValues;
}
export function draftFromItem(item: MealItem): DraftFood {
  return {
    key: crypto.randomUUID(),
    name: item.name,
    snapshotId: item.id,
    grams: String(item.quantity_grams),
    baseGrams: item.quantity_grams,
    values: item,
    source: item.source_snapshot,
  };
}
export function mealPayload(rows: DraftFood[]) {
  if (!rows.length || rows.length > 50)
    throw new Error("Add between 1 and 50 foods to your meal.");
  return rows.map((row) => {
    const grams = Number(row.grams),
      values = scaleNutrients(row.values, row.baseGrams, grams);
    if (
      nutrients.some((n, i) =>
        values[n] === null
          ? i < 4
          : !Number.isFinite(values[n]) ||
            values[n]! < 0 ||
            values[n]! > 1000000,
      )
    )
      throw new Error(
        "Enter valid calories and macros; optional nutrients can remain blank.",
      );
    if (
      Object.entries(values.nutrient_values ?? {}).some(
        ([id, amount]) =>
          !/^\d{1,6}$/.test(id) ||
          !Number.isFinite(amount) ||
          amount < 0 ||
          amount > 1000000,
      )
    )
      throw new Error("A sourced nutrient value is invalid.");
    return {
      name: row.name,
      quantity_grams: grams,
      food_id: row.foodId ?? null,
      snapshot_id: row.snapshotId ?? null,
      nutrients: values,
    };
  });
}
export function sourceLink(url?: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "fdc.nal.usda.gov"
      ? u.href
      : null;
  } catch {
    return null;
  }
}

