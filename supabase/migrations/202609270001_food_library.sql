begin;
alter table public.foods
 add column source_id text,
 add column source_url text,
 add column source_release date,
 add column source_data_type text,
 add column portions jsonb not null default '[]' check(jsonb_typeof(portions)='array');
create unique index foods_source_identity_idx on public.foods(source,source_id) where source_id is not null;
alter table public.meals add column revision integer not null default 1 check(revision>0), add column last_operation uuid;
alter table public.meal_items add column source_snapshot jsonb;
create index meal_items_food_idx on public.meal_items(food_id);

create table public.food_favorites (
 user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 food_id uuid not null references public.foods(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,food_id)
);
alter table public.food_favorites enable row level security;
revoke all on public.food_favorites from public,anon,authenticated;
grant select,insert,delete on public.food_favorites to authenticated;
create policy favorite_owner on public.food_favorites for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create index food_favorites_food_idx on public.food_favorites(food_id);

-- All words must match; literal substring search works for prefixes and common punctuation.
-- The small local catalog needs no external provider requests or provider credentials.
create function public.search_foods(p_query text,p_offset integer default 0)
returns setof public.foods language sql stable security invoker set search_path='' as $$
 select f.* from public.foods f
 where length(trim(coalesce(p_query,''))) between 2 and 100
 and not exists(select 1 from regexp_split_to_table(lower(trim(p_query)),'\s+') word
   where strpos(lower(f.name || ' ' || coalesce(f.brand,'')),word)=0)
 order by f.name,f.id limit 50 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;
revoke all on function public.search_foods(text,integer) from public,anon;
grant execute on function public.search_foods(text,integer) to authenticated;

-- Atomic replacement with optimistic locking and retry-safe operation IDs.
-- Existing item references preserve historical nutrient/source snapshots when scaled.
create function public.save_meal(p_id uuid,p_expected_revision integer,p_operation uuid,p_name text,p_eaten_at timestamptz,p_items jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare
 current_meal public.meals; existing public.meal_items; food public.foods;
 item jsonb; prepared jsonb:='[]'; vals jsonb; provenance jsonb;
 grams numeric; factor numeric; item_name text; food_id uuid; metric text; amount numeric; next_revision integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_id is null or p_operation is null or p_expected_revision is null or p_expected_revision<0
 or p_name is null or length(trim(p_name)) not between 1 and 200
 or p_eaten_at is null or p_eaten_at>now() or not isfinite(p_eaten_at)
 or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid meal'; end if;
 if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'A meal needs 1 to 50 foods'; end if;
 -- Serializes creates and retries as well as updates for this account.
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
  provenance:=null; food_id:=null;
  if nullif(item->>'snapshot_id','') is not null then
   select * into existing from public.meal_items where id=(item->>'snapshot_id')::uuid and user_id=auth.uid();
   if not found then raise exception 'Food snapshot unavailable'; end if;
   factor:=grams/existing.quantity_grams;
   vals:=to_jsonb(existing); item_name:=existing.name; food_id:=existing.food_id; provenance:=existing.source_snapshot;
  elsif nullif(item->>'food_id','') is not null then
   select * into food from public.foods where id=(item->>'food_id')::uuid;
   if not found then raise exception 'Catalog food unavailable'; end if;
   factor:=grams/food.serving_grams; vals:=to_jsonb(food); item_name:=food.name; food_id:=food.id;
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
  prepared:=prepared || jsonb_build_array(vals || jsonb_build_object('name',item_name,'food_id',food_id,'quantity_grams',grams,'source_snapshot',provenance));
 end loop;
 if current_meal.id is null then
  insert into public.meals(id,name,eaten_at,revision,last_operation) values(p_id,trim(p_name),p_eaten_at,next_revision,p_operation);
 else
  update public.meals set name=trim(p_name),eaten_at=p_eaten_at,revision=next_revision,last_operation=p_operation where id=p_id;
  delete from public.meal_items where meal_id=p_id;
 end if;
 insert into public.meal_items(meal_id,food_id,name,quantity_grams,calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,sodium_mg,potassium_mg,source_snapshot)
 select p_id,x.food_id,x.name,x.quantity_grams,x.calories,x.protein_g,x.carbs_g,x.fat_g,x.fiber_g,x.sugar_g,x.saturated_fat_g,x.sodium_mg,x.potassium_mg,x.source_snapshot
 from jsonb_to_recordset(prepared) as x(food_id uuid,name text,quantity_grams numeric,calories numeric,protein_g numeric,carbs_g numeric,fat_g numeric,fiber_g numeric,sugar_g numeric,saturated_fat_g numeric,sodium_mg numeric,potassium_mg numeric,source_snapshot jsonb);
 return next_revision;
end $$;
revoke all on function public.save_meal(uuid,integer,uuid,text,timestamptz,jsonb) from public,anon;
grant execute on function public.save_meal(uuid,integer,uuid,text,timestamptz,jsonb) to authenticated;

create function public.delete_meal(p_id uuid,p_expected_revision integer)
returns void language plpgsql security invoker set search_path='' as $$
declare current_revision integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select revision into current_revision from public.meals where id=p_id for update;
 if not found then return; end if;
 if p_expected_revision is null or current_revision<>p_expected_revision then raise exception 'Meal changed. Reload it before deleting.'; end if;
 delete from public.meals where id=p_id;
end $$;
revoke all on function public.delete_meal(uuid,integer) from public,anon;
grant execute on function public.delete_meal(uuid,integer) to authenticated;
commit;
