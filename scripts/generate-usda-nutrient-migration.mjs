import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const foundation = JSON.parse(
  readFileSync(new URL("data/usda-foundation-normalized.json", root), "utf8"),
);
const fndds = JSON.parse(
  readFileSync(new URL("data/usda-fndds-normalized.json", root), "utf8"),
);
const branded = JSON.parse(
  readFileSync(new URL("data/usda-branded-selected.json", root), "utf8"),
);
const foods = [...foundation.foods, ...fndds.foods, ...branded.foods].map(
  (food) => ({
    ...food,
    serving_amount: food.serving_amount ?? food.serving_grams,
    serving_unit: food.serving_unit ?? "g",
    portions: (food.portions ?? []).map((portion) => ({
      label: portion.label,
      amount: portion.amount ?? portion.grams,
      unit: portion.unit ?? "g",
    })),
  }),
);
if (
  foundation.foods.length !== 311 ||
  fndds.foods.length !== 5431 ||
  branded.foods.length < 100 ||
  branded.foods.length > 1200
) {
  throw new Error(
    "Unexpected USDA import size; inspect both source files first.",
  );
}
const identities = new Set();
const gtins = new Set();
for (const food of foods) {
  const identity = `${food.source}:${food.source_id}`;
  if (identities.has(identity))
    throw new Error(`Duplicate food source identity: ${identity}`);
  identities.add(identity);
  if (food.gtin_upc) {
    if (gtins.has(food.gtin_upc)) {
      throw new Error(`Duplicate GTIN/UPC: ${food.gtin_upc}`);
    }
    gtins.add(food.gtin_upc);
  }
  if (Object.keys(food.nutrient_values).length === 0) {
    throw new Error(`Missing USDA nutrients for ${food.source_id}`);
  }
}
const nutrientDefinitions = new Map();
for (const source of [foundation, fndds, branded]) {
  for (const nutrient of source.nutrient_definitions) {
    const old = nutrientDefinitions.get(nutrient.id);
    if (old && JSON.stringify(old) !== JSON.stringify(nutrient)) {
      throw new Error(`USDA nutrient definition changed for ${nutrient.id}`);
    }
    nutrientDefinitions.set(nutrient.id, nutrient);
  }
}
writeFileSync(
  new URL("src/lib/usda-nutrients.json", root),
  `${JSON.stringify(
    [...nutrientDefinitions.values()].sort((a, b) => a.id - b.id),
    null,
    2,
  )}\n`,
  "utf8",
);
const fields = [
  "id",
  "name",
  "brand",
  "gtin_upc",
  "source",
  "source_id",
  "source_url",
  "source_release",
  "source_data_type",
  "serving_grams",
  "serving_amount",
  "serving_unit",
  "portions",
  "nutrient_values",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "sugar_g",
  "saturated_fat_g",
  "sodium_mg",
  "potassium_mg",
];
const types = [
  "uuid",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "date",
  "text",
  "numeric",
  "numeric",
  "text",
  "jsonb",
  "jsonb",
  ...Array(9).fill("numeric"),
];
const payload = JSON.stringify(foods).replaceAll("'", "''");
const createSeed = (records, heading) => `-- ${heading}
-- See archive SHA256 and CC0 source in data/usda-*-normalized.json and data/usda-branded-selected.json.
insert into public.foods(${fields.join(",")})
select ${fields.join(",")} from jsonb_to_recordset('${JSON.stringify(records).replaceAll("'", "''")}'::jsonb)
as imported(${fields.map((field, i) => `${field} ${types[i]}`).join(",")})
on conflict(source,source_id) where source_id is not null do update set
${fields
  .filter((field) => !["id", "source", "source_id"].includes(field))
  .map((field) => `${field}=excluded.${field}`)
  .join(",\n")};`;

const seed = createSeed(
  foods,
  "USDA Foundation April 2026, FNDDS 2021-2023, and a filtered branded sample.",
);
const template = readFileSync(
  new URL("scripts/templates/usda-catalog-seed.sql", root),
  "utf8",
);
writeFileSync(
  new URL("supabase/migrations/202609270008_usda_catalog_seed.sql", root),
  template.replace("/* USDA_FOOD_SEED */", seed).replace(
    "/* USDA_MEAL_BACKFILL */",
    `-- Existing catalog-linked meals can receive the new sourced snapshot.
update public.meal_items as item
set nutrient_values = (
  select coalesce(
    jsonb_object_agg(
      fact.key,
      to_jsonb(round(fact.value::text::numeric * item.quantity / food.serving_amount, 6))
    ),
    '{}'::jsonb
  )
  from public.foods as food
  cross join lateral jsonb_each(food.nutrient_values) as fact(key, value)
  where food.id = item.food_id
)
where item.nutrient_values = '{}'::jsonb
  and item.food_id is not null
  and exists (
    select 1 from public.foods as food
    where food.id = item.food_id and food.serving_unit = item.quantity_unit
  );`,
  ),
  "utf8",
);
writeFileSync(
  new URL("supabase/migrations/202609270006_usda_branded_expansion.sql", root),
  `-- Filtered USDA Branded expansion; 100 g / 100 ml basis, CC0 data.\nbegin;\n${createSeed(branded.foods, "Filtered USDA Branded April 2026 expansion.")}\ncommit;\n`,
  "utf8",
);
console.log(
  `Generated ${foods.length} foods and ${nutrientDefinitions.size} nutrient definitions (${payload.length.toLocaleString()} data characters).`,
);
