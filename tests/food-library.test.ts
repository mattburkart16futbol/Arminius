import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
import {
  mealPayload,
  scaleNutrients,
  sourceLink,
  type NutrientValues,
} from "../src/lib/food-library";
const db = new PGlite();
const a = crypto.randomUUID(),
  b = crypto.randomUUID();
const food = crypto.randomUUID();
const values: NutrientValues = {
  calories: 200,
  protein_g: 10,
  carbs_g: 25,
  fat_g: 8,
  fiber_g: null,
  sugar_g: 0,
  saturated_fat_g: null,
  sodium_mg: 100,
  potassium_mg: null,
};
async function asUser(id = a) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function save(
  id: string,
  items: unknown[],
  revision = 0,
  operation = crypto.randomUUID(),
) {
  return db.query<{ save_meal: number }>(
    "select save_meal($1,$2,$3,$4,$5,$6)",
    [
      id,
      revision,
      operation,
      "Lunch",
      new Date(Date.now() - 60000).toISOString(),
      JSON.stringify(items),
    ],
  );
}
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;",
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(f, dir), "utf8"));
  await db.query("insert into auth.users values($1),($2)", [a, b]);
  await db.query(
    "insert into foods(id,name,serving_grams,serving_amount,serving_unit,calories,protein_g,carbs_g,fat_g,source,source_id,source_url) values($1,'Test cooked oats',100,100,'g',200,10,25,8,'USDA FoodData Central','test','https://fdc.nal.usda.gov/food-details/test/nutrients')",
    [food],
  );
}, 60000);
afterAll(() => db.close());
it("scales known values, preserves unknowns, and refuses invalid portions", () => {
  expect(scaleNutrients(values, 100, 250)).toMatchObject({
    calories: 500,
    sodium_mg: 250,
    fiber_g: null,
    sugar_g: 0,
  });
  expect(() => scaleNutrients(values, 0, 100)).toThrow();
  expect(() => scaleNutrients(values, 100, NaN)).toThrow();
  expect(() => mealPayload([])).toThrow();
  expect(sourceLink("javascript:alert(1)")).toBeNull();
  expect(sourceLink("https://fdc.nal.usda.gov.evil.example/x")).toBeNull();
  expect(sourceLink("https://www.mcdonalds.com/us/en-us/product/big-mac.html")).not.toBeNull();
  expect(mealPayload([
      {
        key: "drink",
        name: "Cola",
        amount: "355",
        unit: "ml",
        baseAmount: 100,
        baseUnit: "ml",
        values,
        source: null,
      },
    ])[0]).toMatchObject({ quantity: 355, quantity_unit: "ml", nutrients: { calories: 710 } });
});
it("seeds traceable USDA data and searches multiple words with stable pagination", async () => {
  await asUser();
  const count = await db.query<{ count: number }>(
    "select count(*)::int count from foods where source_data_type='Foundation'",
  );
  expect(count.rows[0].count).toBe(311);
  const branded = await db.query<{ count: number; milliliter_count: number }>(
    "select count(*)::int count,count(*) filter(where serving_unit='ml')::int milliliter_count from foods where source_data_type='Branded'",
  );
  expect(branded.rows[0].count).toBeGreaterThanOrEqual(820);
  expect(branded.rows[0].milliliter_count).toBe(154);
  const restaurants = await db.query<{ name: string; calories: string; serving_unit: string; source_url: string }>(
    "select name,calories,serving_unit,source_url from foods where source_data_type='Restaurant menu' order by name",
  );
  expect(restaurants.rows).toHaveLength(4);
  expect(restaurants.rows.every((item) => item.serving_unit === "serving" && item.source_url.startsWith("https://"))).toBe(true);
  expect(Number(restaurants.rows.find((item) => item.name.startsWith("Turkey Tom"))?.calories)).toBe(480);
  const rows = await db.query<{ name: string }>(
    "select name from search_foods('chicken raw')",
  );
  expect(rows.rows.length).toBeGreaterThan(0);
  expect(
    rows.rows.every((r) => /chicken/i.test(r.name) && /raw/i.test(r.name)),
  ).toBe(true);
  expect((await db.query("select id from search_foods('%_')")).rows).toEqual(
    [],
  );
  const first = (
    await db.query<{ id: string }>("select id from search_foods('raw',0)")
  ).rows;
  const next = (
    await db.query<{ id: string }>("select id from search_foods('raw',50)")
  ).rows;
  expect(first).toHaveLength(50);
  expect(next.length).toBeGreaterThan(0);
  expect(next.some((r) => first.some((f) => f.id === r.id))).toBe(false);
});
it("atomically saves multiple foods and derives catalog nutrition on the server", async () => {
  await asUser();
  const id = crypto.randomUUID(),
    op = crypto.randomUUID();
  const items = [
    { food_id: food, quantity_grams: 150, nutrients: { calories: 999999 } },
    { name: "Label food", quantity_grams: 100, nutrients: values },
  ];
  await save(id, items, 0, op);
  await save(id, items, 0, op);
  const rows = (
    await db.query<{
      calories: string;
      fiber_g: null;
      source_snapshot: unknown;
    }>(
      "select calories,fiber_g,source_snapshot from meal_items where meal_id=$1 order by name",
      [id],
    )
  ).rows;
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => Number(r.calories)).sort()).toEqual([200, 300]);
  expect(rows.every((r) => r.fiber_g === null)).toBe(true);
  expect(rows.some((r) => r.source_snapshot !== null)).toBe(true);
  const bad = crypto.randomUUID();
  await expect(
    save(bad, [
      items[0],
      { name: "Bad", quantity_grams: 100, nutrients: { calories: 1 } },
    ]),
  ).rejects.toThrow();
  expect(
    (await db.query("select id from meals where id=$1", [bad])).rows,
  ).toEqual([]);
  await expect(save(id, items, 0)).rejects.toThrow(/Meal changed/);
  await expect(db.query("select delete_meal($1,0)", [id])).rejects.toThrow(
    /Meal changed/,
  );
  await db.query("select delete_meal($1,1)", [id]);
  expect(
    (await db.query("select id from meal_items where meal_id=$1", [id])).rows,
  ).toEqual([]);
});
it("scales milliliters and whole restaurant servings while retaining the unit", async () => {
  const drink = crypto.randomUUID(), sandwich = crypto.randomUUID();
  await db.exec("reset role");
  await db.query(
    "insert into foods(id,name,serving_grams,serving_amount,serving_unit,calories,protein_g,carbs_g,fat_g,source,source_id,source_url) values($1,'Test cola',null,100,'ml',42,0,10.6,0,'Test source','cola','https://example.com/cola'),($2,'Test sandwich',null,1,'serving',480,23,48,19,'Test source','sandwich','https://example.com/sandwich')",
    [drink, sandwich],
  );
  await asUser();
  const drinkMeal = crypto.randomUUID();
  await save(drinkMeal, [{ food_id: drink, quantity: 355, quantity_unit: "ml" }]);
  const drinkItem = (
    await db.query<{ quantity: string; quantity_unit: string; quantity_grams: null; calories: string }>(
      "select quantity,quantity_unit,quantity_grams,calories from meal_items where meal_id=$1",
      [drinkMeal],
    )
  ).rows[0];
  expect(drinkItem).toMatchObject({ quantity: "355", quantity_unit: "ml", quantity_grams: null });
  expect(Number(drinkItem.calories)).toBeCloseTo(149.1);
  const drinkSnapshot = (
    await db.query<{ id: string }>("select id from meal_items where meal_id=$1", [drinkMeal])
  ).rows[0].id;
  await save(drinkMeal, [{ snapshot_id: drinkSnapshot, quantity: 710, quantity_unit: "ml" }], 1);
  expect(
    Number((await db.query<{ calories: string }>("select calories from meal_items where meal_id=$1", [drinkMeal])).rows[0].calories),
  ).toBe(298.2);
  await expect(
    save(crypto.randomUUID(), [{ food_id: drink, quantity: 100, quantity_unit: "g" }]),
  ).rejects.toThrow(/does not match/);
  const sandwichMeal = crypto.randomUUID();
  await save(sandwichMeal, [{ food_id: sandwich, quantity: 2, quantity_unit: "serving" }]);
  const sandwichItem = (
    await db.query<{ quantity: string; quantity_unit: string; calories: string }>(
      "select quantity,quantity_unit,calories from meal_items where meal_id=$1",
      [sandwichMeal],
    )
  ).rows[0];
  expect(sandwichItem).toMatchObject({ quantity: "2", quantity_unit: "serving" });
  expect(Number(sandwichItem.calories)).toBe(960);
});
it("preserves historical snapshots through catalog changes, edits, and meal reuse", async () => {
  await asUser();
  const id = crypto.randomUUID();
  await save(id, [{ food_id: food, quantity_grams: 100 }]);
  const old = (
    await db.query<{ id: string }>(
      "select id from meal_items where meal_id=$1",
      [id],
    )
  ).rows[0].id;
  await db.exec("reset role");
  await db.query("update foods set calories=900 where id=$1", [food]);
  await asUser();
  await save(id, [{ snapshot_id: old, quantity_grams: 200 }], 1);
  const item = (
    await db.query<{ id: string; calories: string }>(
      "select id,calories from meal_items where meal_id=$1",
      [id],
    )
  ).rows[0];
  expect(Number(item.calories)).toBe(400);
  const repeat = crypto.randomUUID();
  await save(repeat, [{ snapshot_id: item.id, quantity_grams: 50 }]);
  expect(
    Number(
      (
        await db.query<{ calories: string }>(
          "select calories from meal_items where meal_id=$1",
          [repeat],
        )
      ).rows[0].calories,
    ),
  ).toBe(100);
  await asUser(b);
  await expect(
    save(crypto.randomUUID(), [{ snapshot_id: item.id, quantity_grams: 50 }]),
  ).rejects.toThrow(/snapshot unavailable/);
  await expect(
    save(
      id,
      [{ name: "Overwrite", quantity_grams: 100, nutrients: values }],
      2,
    ),
  ).rejects.toThrow(/unavailable/);
  await db.query("select delete_meal($1,2)", [id]);
  expect(
    (await db.query("select id from meals where id=$1", [id])).rows,
  ).toEqual([]);
  await asUser();
  expect(
    (await db.query("select id from meals where id=$1", [id])).rows,
  ).toHaveLength(1);
});
it("keeps favorites private and rejects anonymous access", async () => {
  await asUser();
  await db.query("insert into food_favorites(food_id) values($1)", [food]);
  await asUser(b);
  expect((await db.query("select * from food_favorites")).rows).toEqual([]);
  await expect(
    db.query("insert into food_favorites(user_id,food_id) values($1,$2)", [
      a,
      food,
    ]),
  ).rejects.toThrow();
  await db.exec("reset role;set role anon");
  await expect(db.query("select * from search_foods('oats')")).rejects.toThrow(
    /permission denied/,
  );
  await expect(
    save(crypto.randomUUID(), [
      { name: "Anon", quantity_grams: 100, nutrients: values },
    ]),
  ).rejects.toThrow(/permission denied/);
});
