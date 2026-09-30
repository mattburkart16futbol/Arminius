begin;
alter table public.foods add column gtin_upc text;
create unique index foods_gtin_upc_idx on public.foods(gtin_upc) where gtin_upc is not null;
create or replace function public.search_foods(p_query text,p_offset integer default 0)
returns setof public.foods language sql stable security invoker set search_path='' as $$
 select f.* from public.foods f
 where length(trim(coalesce(p_query,''))) between 2 and 100
 and not exists(select 1 from regexp_split_to_table(lower(trim(p_query)),'\s+') word
   where strpos(lower(f.name || ' ' || coalesce(f.brand,'') || ' ' || coalesce(f.gtin_upc,'')),word)=0)
 order by f.name,f.id limit 50 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;
revoke all on function public.search_foods(text,integer) from public,anon;
grant execute on function public.search_foods(text,integer) to authenticated;
alter table public.foods
  add column nutrient_values jsonb not null default '{}'::jsonb
    check (jsonb_typeof(nutrient_values) = 'object');
alter table public.meal_items
  add column nutrient_values jsonb not null default '{}'::jsonb
    check (jsonb_typeof(nutrient_values) = 'object');

-- Extra USDA values are keyed by USDA nutrient ID. Known, useful units and labels
-- live in src/lib/usda-nutrients.json; quantities in foods are per 100 grams.
create or replace function public.save_meal(p_id uuid,p_expected_revision integer,p_operation uuid,p_name text,p_eaten_at timestamptz,p_items jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare
 current_meal public.meals; existing public.meal_items; food public.foods;
 item jsonb; prepared jsonb:='[]'; vals jsonb; provenance jsonb;
 nutrient_values jsonb; nutrient_key text; nutrient_amount numeric;
 grams numeric; factor numeric; item_name text; food_id uuid; metric text; amount numeric; next_revision integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_id is null or p_operation is null or p_expected_revision is null or p_expected_revision<0
 or p_name is null or length(trim(p_name)) not between 1 and 200
 or p_eaten_at is null or p_eaten_at>now() or not isfinite(p_eaten_at)
 or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid meal'; end if;
 if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'A meal needs 1 to 50 foods'; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into current_meal from public.meals where id=p_id for update;
 if found then
  if current_meal.last_operation=p_operation then return current_meal.revision; end if;
  if current_meal.revision<>p_expected_revision then raise exception 'Meal changed. Reload it before editing.'; end if;
  next_revision:=current_meal.revision+1;
 else
  if p_expected_revision<>0 then raise exception 'Meal missing or unavailable'; end if;
  next_revision:=1;
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  grams:=(item->>'quantity_grams')::numeric;
  if grams is null or grams<=0 or grams>100000 then raise exception 'Invalid portion'; end if;
  provenance:=null; food_id:=null; nutrient_values:='{}'::jsonb;
  if nullif(item->>'snapshot_id','') is not null then
   select * into existing from public.meal_items where id=(item->>'snapshot_id')::uuid and user_id=auth.uid();
   if not found then raise exception 'Food snapshot unavailable'; end if;
   factor:=grams/existing.quantity_grams; vals:=to_jsonb(existing); nutrient_values:=existing.nutrient_values;
   item_name:=existing.name; food_id:=existing.food_id; provenance:=existing.source_snapshot;
  elsif nullif(item->>'food_id','') is not null then
   select * into food from public.foods where id=(item->>'food_id')::uuid;
   if not found then raise exception 'Catalog food unavailable'; end if;
   factor:=grams/food.serving_grams; vals:=to_jsonb(food); nutrient_values:=food.nutrient_values;
   item_name:=food.name; food_id:=food.id;
   provenance:=jsonb_build_object('source',food.source,'source_id',food.source_id,'url',food.source_url,'release',food.source_release,'data_type',food.source_data_type);
  else
   factor:=1; vals:=item->'nutrients'; item_name:=trim(item->>'name');
   if vals is null or jsonb_typeof(vals)<>'object' then raise exception 'Enter nutrition label values'; end if;
  end if;
  if item_name is null or length(item_name) not between 1 and 200 then raise exception 'Invalid food name'; end if;
  foreach metric in array array['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g','saturated_fat_g','sodium_mg','potassium_mg'] loop
   amount:=(vals->>metric)::numeric * factor;
   if amount is null and metric in ('calories','protein_g','carbs_g','fat_g') then raise exception 'Calories and macros are required'; end if;
   if amount is not null and (amount<0 or amount>1000000) then raise exception 'Invalid nutrient value'; end if;
   vals:=jsonb_set(vals,array[metric],coalesce(to_jsonb(round(amount,6)),'null'));
  end loop;
  for nutrient_key,nutrient_amount in
   select key,value::text::numeric from jsonb_each(nutrient_values)
  loop
   if nutrient_key !~ '^[0-9]{1,6}$' or nutrient_amount<0 or nutrient_amount>1000000 then
    raise exception 'Invalid additional nutrient';
   end if;
   nutrient_values:=jsonb_set(nutrient_values,array[nutrient_key],to_jsonb(round(nutrient_amount*factor,6)),true);
  end loop;
  prepared:=prepared || jsonb_build_array(vals || jsonb_build_object('name',item_name,'food_id',food_id,'quantity_grams',grams,'source_snapshot',provenance,'nutrient_values',nutrient_values));
 end loop;
 if current_meal.id is null then
  insert into public.meals(id,name,eaten_at,revision,last_operation) values(p_id,trim(p_name),p_eaten_at,next_revision,p_operation);
 else
  update public.meals set name=trim(p_name),eaten_at=p_eaten_at,revision=next_revision,last_operation=p_operation where id=p_id;
  delete from public.meal_items where meal_id=p_id;
 end if;
 insert into public.meal_items(meal_id,food_id,name,quantity_grams,calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,sodium_mg,potassium_mg,source_snapshot,nutrient_values)
 select p_id,x.food_id,x.name,x.quantity_grams,x.calories,x.protein_g,x.carbs_g,x.fat_g,x.fiber_g,x.sugar_g,x.saturated_fat_g,x.sodium_mg,x.potassium_mg,x.source_snapshot,x.nutrient_values
 from jsonb_to_recordset(prepared) as x(food_id uuid,name text,quantity_grams numeric,calories numeric,protein_g numeric,carbs_g numeric,fat_g numeric,fiber_g numeric,sugar_g numeric,saturated_fat_g numeric,sodium_mg numeric,potassium_mg numeric,source_snapshot jsonb,nutrient_values jsonb);
 return next_revision;
end $$;
revoke all on function public.save_meal(uuid,integer,uuid,text,timestamptz,jsonb) from public,anon;
grant execute on function public.save_meal(uuid,integer,uuid,text,timestamptz,jsonb) to authenticated;

commit;
