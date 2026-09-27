-- Current first-party fast-food data plus a sourced ethanol addition.
-- Chick-fil-A's live guide has no effective-date label, so source_release stays NULL.
begin;

-- USDA supplies the nutrition profile per 100 ml. Heineken's U.S. product page
-- confirms 5% ABV; ethanol is calculated as 100 ml * 0.05 * 0.789 g/ml.
update public.foods
set name='Heineken Original Lager',
    source='USDA FoodData Central; Heineken U.S. page confirms 5% ABV; ethanol calculated',
    source_url='https://www.heineken.com/us/en/our-beers/heineken-original/',
    nutrient_values=nutrient_values || '{"1018":3.95,"1258":0,"2000":0}'::jsonb,
    sugar_g=0,
    saturated_fat_g=0
where source_id='2127272' and brand='HEINEKEN' and source_data_type='Branded';

-- Keep a usable record on installations that apply this seed before an optional
-- full USDA catalog snapshot is present.
insert into public.foods(
  name,brand,source,source_id,source_url,source_release,source_data_type,
  serving_grams,serving_amount,serving_unit,portions,nutrient_values,
  calories,protein_g,carbs_g,fat_g,sugar_g,saturated_fat_g
)
select
  'Heineken Original Lager','HEINEKEN',
  'USDA FoodData Central; Heineken U.S. page confirms 5% ABV; ethanol calculated',
  '2127272','https://www.heineken.com/us/en/our-beers/heineken-original/','2026-04-30','Branded',
  null,100,'ml','[{"label":"12 fl oz can or bottle (355 ml)","amount":355,"unit":"ml"}]'::jsonb,
  '{"1003":0.56,"1004":0,"1005":3.1,"1008":40,"1018":3.95,"1258":0,"2000":0}'::jsonb,
  40,0.56,3.1,0,0,0
where not exists (
  select 1 from public.foods where source_id='2127272' and brand='HEINEKEN' and source_data_type='Branded'
)
on conflict(source,source_id) where source_id is not null do nothing;

insert into public.foods(
  name,brand,source,source_id,source_url,source_release,source_data_type,
  serving_grams,serving_amount,serving_unit,portions,nutrient_values,
  calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,sodium_mg
)
values
  ('Chick-fil-A Chicken Sandwich','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-chicken-sandwich','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"1 sandwich (183 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":70,"1257":0}'::jsonb,420,29,41,18,1,6,3.5,1460),
  ('Spicy Chicken Sandwich','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-spicy-chicken-sandwich','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"1 sandwich (188 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":65,"1257":0}'::jsonb,450,28,45,19,1,6,4,1730),
  ('Grilled Chicken Sandwich','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-grilled-chicken-sandwich','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"1 sandwich (206 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":75,"1257":0}'::jsonb,390,28,45,11,3,11,2.5,765),
  ('Deluxe Sandwich with American Cheese','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-deluxe-american','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"1 sandwich (247 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":85,"1257":0}'::jsonb,490,32,43,22,1,7,6,1700),
  ('Chick-fil-A Nuggets, 8-count','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-nuggets-8-count','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"8-count order (113 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":85,"1257":0}'::jsonb,250,27,11,11,0,1,2.5,1210),
  ('Chick-fil-A Nuggets, 12-count','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-nuggets-12-count','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"12-count order (170 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":125,"1257":0}'::jsonb,380,40,16,17,0,1,3.5,1820),
  ('Grilled Nuggets, 8-count','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-grilled-nuggets-8-count','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"8-count order (95 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":85,"1257":0}'::jsonb,130,25,1,3,0,1,0.5,440),
  ('Grilled Nuggets, 12-count','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-grilled-nuggets-12-count','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"12-count order (142 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":130,"1257":0}'::jsonb,200,38,2,4.5,0,1,1,660),
  ('Chick-n-Strips, 2-count','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-strips-2-count','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"2-count order (91 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":50,"1257":0}'::jsonb,200,19,11,9,0,1,2,580),
  ('Chick-n-Strips, 3-count','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-strips-3-count','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"3-count order (136 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":75,"1257":0}'::jsonb,310,29,16,14,0,2,2.5,870),
  ('Waffle Fries, Small','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-waffle-fries-small','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"small order (96 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":0,"1257":0}'::jsonb,320,4,35,19,4,1,3,190),
  ('Waffle Fries, Medium','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-waffle-fries-medium','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"medium order (125 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":0,"1257":0}'::jsonb,420,5,45,24,5,1,4,240),
  ('Waffle Fries, Large','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-waffle-fries-large','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"large order (179 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":0,"1257":0}'::jsonb,600,7,65,35,7,1,5,340),
  ('Mac & Cheese, Small','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-mac-cheese-small','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"small serving (136 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":40,"1257":0}'::jsonb,270,12,17,17,2,2,10,710),
  ('Mac & Cheese, Medium','Chick-fil-A','Chick-fil-A U.S. Nutrition Guide','cfa-us-mac-cheese-medium','https://www.chick-fil-a.com/nutrition-allergens',null,'Restaurant menu',null,1,'serving','[{"label":"medium serving (227 g)","amount":1,"unit":"serving"}]'::jsonb,'{"1253":70,"1257":0}'::jsonb,450,20,28,29,3,3,16,1190)
on conflict(source,source_id) where source_id is not null do update set
  name=excluded.name,brand=excluded.brand,source_url=excluded.source_url,
  source_release=excluded.source_release,source_data_type=excluded.source_data_type,
  serving_grams=excluded.serving_grams,serving_amount=excluded.serving_amount,
  serving_unit=excluded.serving_unit,portions=excluded.portions,
  nutrient_values=excluded.nutrient_values,calories=excluded.calories,
  protein_g=excluded.protein_g,carbs_g=excluded.carbs_g,fat_g=excluded.fat_g,
  fiber_g=excluded.fiber_g,sugar_g=excluded.sugar_g,
  saturated_fat_g=excluded.saturated_fat_g,sodium_mg=excluded.sodium_mg;

commit;
