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
export type FoodUnit = "g" | "ml" | "serving";
export type FoodPortion = { label: string; amount: number; unit: FoodUnit };
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
  serving_amount: number;
  serving_unit: FoodUnit;
  portions: FoodPortion[];
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
  quantity: number;
  quantity_unit: FoodUnit;
  quantity_grams?: number | null;
  source_snapshot: Provenance | null;
  nutrient_values?: Record<string, number>;
};
export type DraftFood = {
  key: string;
  name: string;
  foodId?: string;
  snapshotId?: string;
  amount: string;
  unit: FoodUnit;
  baseAmount: number;
  baseUnit: FoodUnit;
  values: NutrientValues;
  source: Provenance | null;
};
export function unitLabel(unit: FoodUnit, amount?: number) {
  if (unit !== "serving") return unit;
  return amount === 1 ? "serving" : "servings";
}
export function basisLabel(amount: number, unit: FoodUnit) {
  return `per ${amount} ${unitLabel(unit, amount)}`;
}
export function localDateTime(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function scaleNutrients(
  values: NutrientValues,
  fromAmount: number,
  toAmount: number,
): NutrientValues {
  if (
    !Number.isFinite(fromAmount) ||
    fromAmount <= 0 ||
    !Number.isFinite(toAmount) ||
    toAmount <= 0 ||
    toAmount > 100000
  )
    throw new Error("Enter a quantity between 0 and 100,000.");
  return Object.fromEntries([
    ...nutrients.map((n) => [
      n,
      values[n] === null
        ? null
        : Number(((values[n]! * toAmount) / fromAmount).toFixed(6)),
    ]),
    [
      "nutrient_values",
      Object.fromEntries(
        Object.entries(values.nutrient_values ?? {}).map(([id, amount]) => [
          id,
          Number(((amount * toAmount) / fromAmount).toFixed(6)),
        ]),
      ),
    ],
  ]) as NutrientValues;
}
export function draftFromItem(item: MealItem): DraftFood {
  const unit = item.quantity_unit ?? "g";
  const amount = item.quantity ?? item.quantity_grams ?? 0;
  return {
    key: crypto.randomUUID(),
    name: item.name,
    snapshotId: item.id,
    amount: String(amount),
    unit,
    baseAmount: amount,
    baseUnit: unit,
    values: item,
    source: item.source_snapshot,
  };
}
export function mealPayload(rows: DraftFood[]) {
  if (!rows.length || rows.length > 50)
    throw new Error("Add between 1 and 50 foods to your meal.");
  return rows.map((row) => {
    if (row.unit !== row.baseUnit)
      throw new Error("Keep each food in its source measurement unit.");
    const quantity = Number(row.amount),
      values = scaleNutrients(row.values, row.baseAmount, quantity);
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
      quantity,
      quantity_unit: row.unit,
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
    const allowedHosts = new Set([
      "fdc.nal.usda.gov",
      "www.mcdonalds.com",
      "www.subway.com",
      "www.tacobell.com",
      "www.wendys.com",
      "order.wendys.com",
      "resources.jimmyjohns.com",
    ]);
    return u.protocol === "https:" && allowedHosts.has(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
