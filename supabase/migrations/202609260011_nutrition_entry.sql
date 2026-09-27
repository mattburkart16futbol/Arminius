begin;
-- Invoker security preserves the existing meal/item ownership chain.
create function public.save_meal_entry(p_id uuid,p_name text,p_grams numeric,p_eaten_at timestamptz,p_food_id uuid,p_nutrients jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_id is null or p_name is null or length(trim(p_name)) not between 1 and 200 or p_grams is null or p_grams<=0 or p_grams>100000
 or p_eaten_at is null or p_eaten_at>now() then raise exception 'Invalid meal'; end if;
 if exists(select 1 from public.meals where id=p_id) then return; end if;
 insert into public.meals(id,name,eaten_at) values(p_id,trim(p_name),p_eaten_at);
 insert into public.meal_items(meal_id,food_id,name,quantity_grams,calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,sodium_mg,potassium_mg)
 values(p_id,p_food_id,trim(p_name),p_grams,(p_nutrients->>'calories')::numeric,(p_nutrients->>'protein_g')::numeric,(p_nutrients->>'carbs_g')::numeric,(p_nutrients->>'fat_g')::numeric,
 (p_nutrients->>'fiber_g')::numeric,(p_nutrients->>'sugar_g')::numeric,(p_nutrients->>'saturated_fat_g')::numeric,(p_nutrients->>'sodium_mg')::numeric,(p_nutrients->>'potassium_mg')::numeric);
end $$;
revoke all on function public.save_meal_entry(uuid,text,numeric,timestamptz,uuid,jsonb) from public,anon;
grant execute on function public.save_meal_entry(uuid,text,numeric,timestamptz,uuid,jsonb) to authenticated;
create function public.save_daily_nutrition_target(p_metric text,p_value numeric,p_direction text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_metric not in ('calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g','saturated_fat_g','sodium_mg','potassium_mg') or p_metric is null or p_value is null or p_value<=0 or p_value>1000000 then raise exception 'Invalid target'; end if;
 -- Serialize concurrent replacements for this account without removing goal-linked targets.
 perform 1 from public.profiles where id=auth.uid() for update;
 delete from public.targets where user_id=auth.uid() and metric=p_metric and period='daily' and goal_id is null;
 insert into public.targets(metric,target_value,period,direction) values(p_metric,p_value,'daily',p_direction);
end $$;
revoke all on function public.save_daily_nutrition_target(text,numeric,text) from public,anon;
grant execute on function public.save_daily_nutrition_target(text,numeric,text) to authenticated;
commit;
