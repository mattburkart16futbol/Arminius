begin;

-- Catalog nutrition can be stated per 100 g, 100 ml, or one menu serving.
alter table public.foods
  add column serving_amount numeric,
  add column serving_unit text;
update public.foods
set serving_amount = serving_grams,
    serving_unit = 'g';
alter table public.foods
  alter column serving_amount set not null,
  alter column serving_unit set not null,
  alter column serving_grams drop not null,
  add constraint foods_serving_amount_positive check (serving_amount > 0),
  add constraint foods_serving_unit_valid check (serving_unit in ('g','ml','serving'));

-- Portion choices now carry their own unit. Convert existing gram portions.
update public.foods as food
set portions = coalesce((
  select jsonb_agg(
    jsonb_build_object(
      'label', portion->>'label',
      'amount', coalesce(nullif(portion->>'amount','')::numeric, nullif(portion->>'grams','')::numeric),
      'unit', coalesce(nullif(portion->>'unit',''), 'g')
    )
  )
  from jsonb_array_elements(food.portions) as portion
), '[]'::jsonb);

-- Keep the old grams column for old readers, while saving a true amount/unit pair.
alter table public.meal_items
  add column quantity numeric,
  add column quantity_unit text;
update public.meal_items
set quantity = quantity_grams,
    quantity_unit = 'g';
alter table public.meal_items
  alter column quantity set not null,
  alter column quantity_unit set not null,
  alter column quantity_grams drop not null,
  add constraint meal_items_quantity_positive check (quantity > 0),
  add constraint meal_items_quantity_unit_valid check (quantity_unit in ('g','ml','serving')),
  add constraint meal_items_legacy_grams_consistent check (quantity_grams is null or quantity_unit = 'g');

create or replace function public.save_meal(p_id uuid,p_expected_revision integer,p_operation uuid,p_name text,p_eaten_at timestamptz,p_items jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare
 current_meal public.meals; existing public.meal_items; food public.foods;
 item jsonb; prepared jsonb:='[]'; vals jsonb; provenance jsonb;
 nutrient_values jsonb; nutrient_key text; nutrient_amount numeric;
 quantity numeric; quantity_unit text; factor numeric; item_name text; food_id uuid;
 metric text; amount numeric; next_revision integer;
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
  quantity:=coalesce(nullif(item->>'quantity','')::numeric,nullif(item->>'quantity_grams','')::numeric);
  quantity_unit:=coalesce(nullif(item->>'quantity_unit',''),'g');
  if quantity is null or quantity<=0 or quantity>100000 or quantity_unit not in ('g','ml','serving') then
   raise exception 'Invalid portion';
  end if;
  provenance:=null; food_id:=null; nutrient_values:='{}'::jsonb;
  if nullif(item->>'snapshot_id','') is not null then
   select * into existing from public.meal_items where id=(item->>'snapshot_id')::uuid and user_id=auth.uid();
   if not found then raise exception 'Food snapshot unavailable'; end if;
   if existing.quantity_unit<>quantity_unit then raise exception 'Keep a saved food in its original measurement unit'; end if;
   factor:=quantity/existing.quantity; vals:=to_jsonb(existing); nutrient_values:=existing.nutrient_values;
   item_name:=existing.name; food_id:=existing.food_id; provenance:=existing.source_snapshot;
  elsif nullif(item->>'food_id','') is not null then
   select * into food from public.foods where id=(item->>'food_id')::uuid;
   if not found then raise exception 'Catalog food unavailable'; end if;
   if food.serving_unit<>quantity_unit then raise exception 'Food quantity unit does not match its nutrition source'; end if;
   factor:=quantity/food.serving_amount; vals:=to_jsonb(food); nutrient_values:=food.nutrient_values;
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
  for nutrient_key,nutrient_amount in select key,value::text::numeric from jsonb_each(nutrient_values) loop
   if nutrient_key !~ '^[0-9]{1,6}$' or nutrient_amount<0 or nutrient_amount>1000000 then
    raise exception 'Invalid additional nutrient';
   end if;
   nutrient_values:=jsonb_set(nutrient_values,array[nutrient_key],to_jsonb(round(nutrient_amount*factor,6)),true);
  end loop;
  prepared:=prepared || jsonb_build_array(vals || jsonb_build_object(
   'name',item_name,'food_id',food_id,'quantity',quantity,'quantity_unit',quantity_unit,
   'quantity_grams',case when quantity_unit='g' then quantity else null end,
   'source_snapshot',provenance,'nutrient_values',nutrient_values));
 end loop;
 if current_meal.id is null then
  insert into public.meals(id,name,eaten_at,revision,last_operation) values(p_id,trim(p_name),p_eaten_at,next_revision,p_operation);
 else
  update public.meals set name=trim(p_name),eaten_at=p_eaten_at,revision=next_revision,last_operation=p_operation where id=p_id;
  delete from public.meal_items where meal_id=p_id;
 end if;
 insert into public.meal_items(meal_id,food_id,name,quantity,quantity_unit,quantity_grams,calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,sodium_mg,potassium_mg,source_snapshot,nutrient_values)
 select p_id,x.food_id,x.name,x.quantity,x.quantity_unit,x.quantity_grams,x.calories,x.protein_g,x.carbs_g,x.fat_g,x.fiber_g,x.sugar_g,x.saturated_fat_g,x.sodium_mg,x.potassium_mg,x.source_snapshot,x.nutrient_values
 from jsonb_to_recordset(prepared) as x(food_id uuid,name text,quantity numeric,quantity_unit text,quantity_grams numeric,calories numeric,protein_g numeric,carbs_g numeric,fat_g numeric,fiber_g numeric,sugar_g numeric,saturated_fat_g numeric,sodium_mg numeric,potassium_mg numeric,source_snapshot jsonb,nutrient_values jsonb);
 return next_revision;
end $$;
revoke all on function public.save_meal(uuid,integer,uuid,text,timestamptz,jsonb) from public,anon;
grant execute on function public.save_meal(uuid,integer,uuid,text,timestamptz,jsonb) to authenticated;

-- Preserve the earlier single-item RPC contract for existing clients.
create or replace function public.save_meal_entry(p_id uuid,p_name text,p_grams numeric,p_eaten_at timestamptz,p_food_id uuid,p_nutrients jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_id is null or p_name is null or length(trim(p_name)) not between 1 and 200 or p_grams is null or p_grams<=0 or p_grams>100000
 or p_eaten_at is null or p_eaten_at>now() then raise exception 'Invalid meal'; end if;
 if exists(select 1 from public.meals where id=p_id) then return; end if;
 insert into public.meals(id,name,eaten_at) values(p_id,trim(p_name),p_eaten_at);
 insert into public.meal_items(meal_id,food_id,name,quantity_grams,quantity,quantity_unit,calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,sodium_mg,potassium_mg)
 values(p_id,p_food_id,trim(p_name),p_grams,p_grams,'g',(p_nutrients->>'calories')::numeric,(p_nutrients->>'protein_g')::numeric,(p_nutrients->>'carbs_g')::numeric,(p_nutrients->>'fat_g')::numeric,
 (p_nutrients->>'fiber_g')::numeric,(p_nutrients->>'sugar_g')::numeric,(p_nutrients->>'saturated_fat_g')::numeric,(p_nutrients->>'sodium_mg')::numeric,(p_nutrients->>'potassium_mg')::numeric);
end $$;
revoke all on function public.save_meal_entry(uuid,text,numeric,timestamptz,uuid,jsonb) from public,anon;
grant execute on function public.save_meal_entry(uuid,text,numeric,timestamptz,uuid,jsonb) to authenticated;

commit;
