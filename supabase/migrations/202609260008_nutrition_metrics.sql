-- Expand nutrition snapshots and targets without rewriting deployed foundation migrations.
begin;

alter table public.foods
  add column if not exists fiber_g numeric check (fiber_g >= 0),
  add column if not exists sugar_g numeric check (sugar_g >= 0),
  add column if not exists saturated_fat_g numeric check (saturated_fat_g >= 0),
  add column if not exists sodium_mg numeric check (sodium_mg >= 0),
  add column if not exists potassium_mg numeric check (potassium_mg >= 0);

alter table public.meal_items
  add column if not exists fiber_g numeric check (fiber_g >= 0),
  add column if not exists sugar_g numeric check (sugar_g >= 0),
  add column if not exists saturated_fat_g numeric check (saturated_fat_g >= 0),
  add column if not exists sodium_mg numeric check (sodium_mg >= 0),
  add column if not exists potassium_mg numeric check (potassium_mg >= 0);

alter table public.targets
  drop constraint if exists targets_metric_check;

alter table public.targets
  add constraint targets_metric_check check (
    metric in (
      'sessions',
      'calories',
      'protein_g',
      'carbs_g',
      'fat_g',
      'fiber_g',
      'sugar_g',
      'saturated_fat_g',
      'sodium_mg',
      'potassium_mg',
      'weight_kg',
      'steps',
      'water_ml'
    )
  );

alter table public.targets
  add column if not exists direction text not null default 'target'
    check (direction in ('minimum','maximum','target'));

-- PostgreSQL numeric accepts NaN/Infinity; keep nutrition arithmetic finite.
do $$ declare t text; n text; begin
 foreach t in array array['foods','meal_items'] loop
  foreach n in array array['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g','saturated_fat_g','sodium_mg','potassium_mg'] loop
   execute format('alter table public.%I add constraint %I check (%I < ''Infinity''::numeric)',t,t||'_'||n||'_finite',n);
  end loop;
 end loop;
end $$;
commit;
