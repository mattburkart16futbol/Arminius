-- A small first-party restaurant pilot. Quantities are complete menu items,
-- not weighed portions; menu recipes can vary by location.
begin;
insert into public.foods(
  id,name,brand,source,source_id,source_url,source_release,source_data_type,
  serving_grams,serving_amount,serving_unit,portions,
  calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,sodium_mg
)
values
(
  '364a21cb-17c6-56ae-b20e-788319363790','Oven-Roasted Turkey, 6-inch','Subway',
  'Subway Official U.S. Nutrition Guide','subway-us-2026-01-6in-oven-roasted-turkey',
  'https://www.subway.com/en-us/-/media/northamerica/usa/nutrition/nutritiondocuments/2026/us_nutrition_en_1-2026.pdf',
  '2026-01-01','Restaurant menu',null,1,'serving',
  '[{"label":"1 six-inch sub (233 g, guide serving)","amount":1,"unit":"serving"}]'::jsonb,
  480,26,42,23,3,5,7,1150
),
(
  '6f6ed839-73ef-58ec-b7de-1bbc89541016','Turkey Tom, 8-inch French','Jimmy John''s',
  'Jimmy John''s Official Nutrition Guide','jimmy-johns-us-2024-07-22-turkey-tom-8in-french',
  'https://resources.jimmyjohns.com/downloadable-files/NutritionGuide.pdf',
  '2024-07-22','Restaurant menu',null,1,'serving',
  '[{"label":"1 8-inch French sandwich","amount":1,"unit":"serving"}]'::jsonb,
  480,23,48,19,4,2,2.5,1160
),
(
  '095101e7-cf09-5d6c-89fa-552267072b68','The Pepe, 8-inch French','Jimmy John''s',
  'Jimmy John''s Official Nutrition Guide','jimmy-johns-us-2024-07-22-the-pepe-8in-french',
  'https://resources.jimmyjohns.com/downloadable-files/NutritionGuide.pdf',
  '2024-07-22','Restaurant menu',null,1,'serving',
  '[{"label":"1 8-inch French sandwich","amount":1,"unit":"serving"}]'::jsonb,
  600,29,50,29,4,4,9,1570
),
(
  '52b46109-c512-51fb-aeb8-20259fbf2e94','Big John, 8-inch French','Jimmy John''s',
  'Jimmy John''s Official Nutrition Guide','jimmy-johns-us-2024-07-22-big-john-8in-french',
  'https://resources.jimmyjohns.com/downloadable-files/NutritionGuide.pdf',
  '2024-07-22','Restaurant menu',null,1,'serving',
  '[{"label":"1 8-inch French sandwich","amount":1,"unit":"serving"}]'::jsonb,
  500,26,47,21,4,2,3.5,1110
)
on conflict(source,source_id) where source_id is not null do update set
  name=excluded.name,brand=excluded.brand,source_url=excluded.source_url,
  source_release=excluded.source_release,source_data_type=excluded.source_data_type,
  serving_grams=excluded.serving_grams,serving_amount=excluded.serving_amount,
  serving_unit=excluded.serving_unit,portions=excluded.portions,
  calories=excluded.calories,protein_g=excluded.protein_g,carbs_g=excluded.carbs_g,
  fat_g=excluded.fat_g,fiber_g=excluded.fiber_g,sugar_g=excluded.sugar_g,
  saturated_fat_g=excluded.saturated_fat_g,sodium_mg=excluded.sodium_mg;
commit;
