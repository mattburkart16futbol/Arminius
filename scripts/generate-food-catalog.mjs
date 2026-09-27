import { readFileSync } from "node:fs";
const source = JSON.parse(
  readFileSync(
    new URL("../data/usda-foundation.json", import.meta.url),
    "utf8",
  ),
);
const fields = [
  "id",
  "name",
  "source",
  "source_id",
  "source_url",
  "source_release",
  "source_data_type",
  "serving_grams",
  "portions",
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
  "date",
  "text",
  "numeric",
  "jsonb",
  ...Array(9).fill("numeric"),
];
const data = JSON.stringify(source.foods).replaceAll("'", "''");
console.log(`-- USDA FoodData Central Foundation ${source.release}; CC0-1.0.
-- Source archive SHA256: ${source.archive_sha256}
-- Generated from data/usda-foundation.json. Future imports must use a NEW migration.
begin;
insert into public.foods(${fields.join(",")})
select ${fields.join(",")} from jsonb_to_recordset('${data}'::jsonb)
as food(${fields.map((f, i) => `${f} ${types[i]}`).join(",")})
on conflict(source,source_id) where source_id is not null do update set
${fields
  .filter((f) => !["id", "source", "source_id"].includes(f))
  .map((f) => `${f}=excluded.${f}`)
  .join(",")};
commit;`);
