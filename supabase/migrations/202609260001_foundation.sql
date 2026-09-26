begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  timezone text not null default 'UTC',
  unit_system text not null default 'metric' check (unit_system in ('metric','imperial')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  category text not null check (category in ('training','nutrition','body','habit')),
  status text not null default 'active' check (status in ('active','completed','archived')),
  starts_on date not null default current_date, ends_on date,
  created_at timestamptz not null default now(), unique(id,user_id), check (ends_on is null or ends_on >= starts_on)
);
create table public.targets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  goal_id uuid, metric text not null check (metric in ('sessions','calories','protein_g','carbs_g','fat_g','weight_kg','steps','water_ml')),
  target_value numeric not null check (target_value > 0), period text not null check (period in ('daily','weekly','milestone')),
  created_at timestamptz not null default now(), foreign key(goal_id,user_id) references public.goals(id,user_id) on delete cascade
);

-- Global catalogs are curated by migrations or trusted server code, never the browser.
create table public.exercises (
  id text primary key, name text not null, equipment text not null,
  instructions text not null default '', created_at timestamptz not null default now()
);
create table public.exercise_muscles (
  exercise_id text not null references public.exercises(id) on delete cascade,
  muscle_id text not null check (muscle_id in ('chest','shoulders','biceps','triceps','forearms','core','quads','hamstrings','glutes','calves','lats','upper_back','lower_back')),
  involvement numeric not null check (involvement > 0 and involvement <= 1), primary key(exercise_id,muscle_id)
);
create table public.workouts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null default 'Workout' check (length(name) between 1 and 200),
  started_at timestamptz not null default now(), ended_at timestamptz, notes text not null default '',
  unique(id,user_id), check (ended_at is null or ended_at >= started_at)
);
create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  workout_id uuid not null, exercise_id text not null references public.exercises(id),
  position integer not null check (position >= 0), notes text not null default '',
  foreign key(workout_id,user_id) references public.workouts(id,user_id) on delete cascade,
  unique(id,user_id), unique(workout_id,position)
);
create table public.sets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  workout_exercise_id uuid not null, position integer not null check(position >= 0),
  kind text not null default 'working' check(kind in ('warmup','working','dropset')),
  reps integer check(reps >= 0), weight_kg numeric check(weight_kg >= 0), duration_seconds integer check(duration_seconds > 0), distance_m numeric check(distance_m > 0),
  rpe numeric check(rpe between 1 and 10), completed_at timestamptz,
  foreign key(workout_exercise_id,user_id) references public.workout_exercises(id,user_id) on delete cascade,
  unique(workout_exercise_id,position), check(reps is not null or duration_seconds is not null or distance_m is not null)
);
create table public.foods (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200), brand text,
  serving_grams numeric not null check(serving_grams > 0),
  calories numeric not null check(calories >= 0), protein_g numeric not null check(protein_g >= 0), carbs_g numeric not null check(carbs_g >= 0), fat_g numeric not null check(fat_g >= 0),
  source text not null default 'curated', created_at timestamptz not null default now()
);
create table public.meals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check(length(name) between 1 and 200), eaten_at timestamptz not null default now(), unique(id,user_id)
);
create table public.meal_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  meal_id uuid not null, food_id uuid references public.foods(id) on delete set null,
  -- Snapshot nutrients for the consumed portion, unaffected by future catalog edits.
  name text not null, quantity_grams numeric not null check(quantity_grams > 0),
  calories numeric not null check(calories >= 0), protein_g numeric not null check(protein_g >= 0), carbs_g numeric not null check(carbs_g >= 0), fat_g numeric not null check(fat_g >= 0),
  foreign key(meal_id,user_id) references public.meals(id,user_id) on delete cascade
);
create table public.body_metrics (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  measured_at timestamptz not null default now(), weight_kg numeric check(weight_kg > 0), body_fat_percent numeric check(body_fat_percent > 0 and body_fat_percent < 100), waist_cm numeric check(waist_cm > 0),
  check(weight_kg is not null or body_fat_percent is not null or waist_cm is not null)
);
create table public.achievements (
  id text primary key, name text not null, description text not null, criteria jsonb not null default '{}'::jsonb
);
create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade, achievement_id text not null references public.achievements(id),
  awarded_at timestamptz not null default now(), primary key(user_id,achievement_id)
);
create table public.personal_records (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null references public.exercises(id), metric text not null check(metric in ('weight_kg','reps','duration_seconds','distance_m')),
  value numeric not null check(value > 0), achieved_at timestamptz not null default now(), unique(user_id,exercise_id,metric)
);
create table public.leaderboard_settings (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  opted_in boolean not null default false, alias text check(length(alias) between 2 and 40),
  updated_at timestamptz not null default now(), check(not opted_in or alias is not null)
);
create table public.ai_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('training','nutrition')), status text not null default 'queued' check(status in ('queued','processing','completed','failed')),
  input jsonb not null default '{}'::jsonb, error_code text, created_at timestamptz not null default now(), unique(id,user_id)
);
create table public.recommendations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  ai_request_id uuid not null, content jsonb not null, model_version text not null, created_at timestamptz not null default now(),
  foreign key(ai_request_id,user_id) references public.ai_requests(id,user_id) on delete cascade
);

-- Deny anonymous access and start from explicit grants (including on hosted Supabase).
do $$
declare t text;
begin
  foreach t in array array['profiles','goals','targets','exercises','exercise_muscles','workouts','workout_exercises','sets','foods','meals','meal_items','body_metrics','achievements','user_achievements','personal_records','leaderboard_settings','ai_requests','recommendations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['goals','targets','workouts','workout_exercises','sets','meals','meal_items','body_metrics','leaderboard_settings'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create index %I on public.%I(user_id)', t || '_owner_idx', t);
  end loop;
  foreach t in array array['exercises','exercise_muscles','foods','achievements'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy catalog_read on public.%I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['user_achievements','personal_records','ai_requests','recommendations'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create index %I on public.%I(user_id)', t || '_owner_idx', t);
  end loop;
end $$;
grant select on public.profiles to authenticated;
grant update(display_name,timezone,unit_system) on public.profiles to authenticated;
create policy profile_read on public.profiles for select to authenticated using((select auth.uid()) = id);
create policy profile_update on public.profiles for update to authenticated using((select auth.uid()) = id) with check((select auth.uid()) = id);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.touch_updated_at();
create trigger leaderboard_updated before update on public.leaderboard_settings for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values(new.id) on conflict do nothing;
  insert into public.leaderboard_settings(user_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Also support installation into a project with existing Auth users.
insert into public.profiles(id) select id from auth.users on conflict do nothing;
insert into public.leaderboard_settings(user_id) select id from public.profiles on conflict do nothing;

create index workouts_timeline_idx on public.workouts(user_id,started_at desc);
create index meals_timeline_idx on public.meals(user_id,eaten_at desc);
create index metrics_timeline_idx on public.body_metrics(user_id,measured_at desc);
create index workout_exercises_parent_idx on public.workout_exercises(workout_id,user_id);
create index sets_parent_idx on public.sets(workout_exercise_id,user_id);
create index meal_items_parent_idx on public.meal_items(meal_id,user_id);
create index targets_goal_idx on public.targets(goal_id,user_id);
create index recommendations_request_idx on public.recommendations(ai_request_id,user_id);
commit;
