-- Benchmark leaderboards + weekly trending dashboards.
-- Requires prior friendship/strength percentile migration.
begin;

create table if not exists public.benchmark_lifts (
  exercise_id text primary key references public.exercises(id) on delete cascade,
  display_name text not null,
  category text not null check (category in ('chest','back','legs','shoulders')),
  sort_order integer not null check (sort_order >= 0),
  machine_variability_note boolean not null default false,
  active boolean not null default true
);

alter table public.benchmark_lifts enable row level security;
revoke all on public.benchmark_lifts from anon, authenticated;
grant select on public.benchmark_lifts to authenticated;

drop policy if exists benchmark_lifts_authenticated_read on public.benchmark_lifts;
create policy benchmark_lifts_authenticated_read
  on public.benchmark_lifts
  for select
  to authenticated
  using (true);

insert into public.benchmark_lifts
  (exercise_id, display_name, category, sort_order, machine_variability_note)
values
  ('barbell-bench-press', 'Bench Press', 'chest', 10, false),
  ('dumbbell-bench-press', 'Dumbbell Bench Press', 'chest', 20, false),
  ('barbell-back-squat', 'Back Squat', 'legs', 30, false),
  ('conventional-deadlift', 'Deadlift', 'legs', 40, false),
  ('leg-press', 'Leg Press', 'legs', 50, true),
  ('barbell-hip-thrust', 'Hip Thrust', 'legs', 60, false),
  ('barbell-overhead-press', 'Overhead Press', 'shoulders', 70, false),
  ('weighted-pull-up', 'Weighted Pull-up', 'back', 80, false),
  ('lat-pulldown', 'Lat Pulldown', 'back', 90, true),
  ('seated-cable-row', 'Seated Cable Row', 'back', 100, true)
on conflict (exercise_id) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  sort_order = excluded.sort_order,
  machine_variability_note = excluded.machine_variability_note,
  active = true;

create table if not exists public.benchmark_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null references public.benchmark_lifts(exercise_id) on delete cascade,
  latest_e1rm_kg numeric check (latest_e1rm_kg > 0),
  latest_relative_e1rm numeric check (latest_relative_e1rm > 0),
  latest_at timestamptz,
  best_e1rm_kg numeric check (best_e1rm_kg > 0),
  best_relative_e1rm numeric check (best_relative_e1rm > 0),
  growth_90d_pct numeric,
  growth_baseline_e1rm_kg numeric check (growth_baseline_e1rm_kg > 0),
  growth_latest_e1rm_kg numeric check (growth_latest_e1rm_kg > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.benchmark_scores enable row level security;
revoke all on public.benchmark_scores from anon, authenticated;
grant select on public.benchmark_scores to authenticated;

drop policy if exists benchmark_scores_owner_read on public.benchmark_scores;
create policy benchmark_scores_owner_read
  on public.benchmark_scores
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists benchmark_scores_absolute_idx
  on public.benchmark_scores(exercise_id, best_e1rm_kg desc nulls last);
create index if not exists benchmark_scores_relative_idx
  on public.benchmark_scores(exercise_id, best_relative_e1rm desc nulls last);
create index if not exists benchmark_scores_growth_idx
  on public.benchmark_scores(exercise_id, growth_90d_pct desc nulls last);


-- Private invalidation queue: avoid rescanning every athlete on every page load.
create table public.strength_cache_state (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 dirty boolean not null default true,
 refresh_after timestamptz not null default '-infinity'
);
alter table public.strength_cache_state enable row level security;
revoke all on public.strength_cache_state from public,anon,authenticated;
insert into public.strength_cache_state(user_id) select id from public.profiles;

create function public._invalidate_strength() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP<>'INSERT' then
  insert into public.strength_cache_state(user_id) select old.user_id where exists(select 1 from public.profiles where id=old.user_id)
  on conflict(user_id) do update set dirty=true;
 end if;
 if TG_OP<>'DELETE' then
  insert into public.strength_cache_state(user_id) values(new.user_id) on conflict(user_id) do update set dirty=true;
 end if;
 return null;
end $$;
revoke all on function public._invalidate_strength() from public,anon,authenticated;
create trigger workouts_strength_dirty after insert or update or delete on public.workouts for each row execute function public._invalidate_strength();
create trigger lifts_strength_dirty after insert or update or delete on public.workout_exercises for each row execute function public._invalidate_strength();
create trigger sets_strength_dirty after insert or update or delete on public.sets for each row execute function public._invalidate_strength();
create trigger body_strength_dirty after insert or update or delete on public.body_metrics for each row execute function public._invalidate_strength();

-- One formula shared by personal percentiles and benchmark boards.
create function public._session_strengths(p_uid uuid)
returns table(exercise_id text,workout_id uuid,started_at timestamptz,e1rm_kg numeric,bodyweight_kg numeric)
language sql stable set search_path='' as $$
 select we.exercise_id,w.id,w.started_at,
 max((s.weight_kg+case when we.exercise_id='weighted-pull-up' then bw.weight_kg else 0 end)*(1+s.reps::numeric/30)),bw.weight_kg
 from public.workouts w join public.workout_exercises we on we.workout_id=w.id and we.user_id=w.user_id
 join public.exercises e on e.id=we.exercise_id
 join public.sets s on s.workout_exercise_id=we.id and s.user_id=w.user_id
 left join lateral(select bm.weight_kg from public.body_metrics bm where bm.user_id=w.user_id
  and bm.weight_kg>0 and bm.weight_kg<'Infinity'::numeric and bm.measured_at<=w.started_at
  and bm.measured_at>=w.started_at-interval '90 days' order by bm.measured_at desc,bm.id desc limit 1) bw on true
 where w.user_id=p_uid and w.ended_at is not null and w.ended_at<=now() and w.started_at<=now()
 and s.completed_at is not null and s.completed_at<=w.ended_at and s.kind<>'warmup'
 and s.reps between 1 and 12 and s.weight_kg>0 and s.weight_kg<=2000
 and e.tracking_mode='reps' and e.load_mode<>'assistance'
 and (e.e1rm_eligible or exists(select 1 from public.benchmark_lifts bl where bl.exercise_id=e.id and bl.active))
 and (we.exercise_id<>'weighted-pull-up' or bw.weight_kg is not null)
 group by we.exercise_id,w.id,w.started_at,bw.weight_kg;
$$;
revoke all on function public._session_strengths(uuid) from public,anon,authenticated;

create function public._refresh_user_strength(p_uid uuid) returns void language plpgsql security definer set search_path='' as $$
declare state public.strength_cache_state%rowtype; expiry timestamptz;
begin
 insert into public.strength_cache_state(user_id) values(p_uid) on conflict do nothing;
 select * into state from public.strength_cache_state where user_id=p_uid for update;
 if not state.dirty and state.refresh_after>now() then return; end if;
 delete from public.strength_scores where user_id=p_uid;
 delete from public.benchmark_scores where user_id=p_uid;
 with scores as materialized(select * from public._session_strengths(p_uid)),
 abs_best as(select distinct on(exercise_id) * from scores order by exercise_id,e1rm_kg desc,started_at,workout_id),
 rel_best as(select distinct on(exercise_id) * from scores where bodyweight_kg>0 order by exercise_id,e1rm_kg/bodyweight_kg desc,started_at,workout_id)
 insert into public.strength_scores(user_id,exercise_id,best_e1rm_kg,best_e1rm_at,best_relative_e1rm,relative_bodyweight_kg,best_relative_at)
 select p_uid,a.exercise_id,a.e1rm_kg,a.started_at,r.e1rm_kg/r.bodyweight_kg,r.bodyweight_kg,r.started_at from abs_best a left join rel_best r using(exercise_id);

 with scores as materialized(select ss.* from public._session_strengths(p_uid) ss join public.benchmark_lifts bl using(exercise_id) where bl.active),
 latest as(select distinct on(exercise_id) * from scores order by exercise_id,started_at desc,workout_id desc),
 growth as(select *,row_number() over(partition by exercise_id order by started_at,workout_id) first_n,
 row_number() over(partition by exercise_id order by started_at desc,workout_id desc) last_n,
 count(*) over(partition by exercise_id) n from scores where started_at>now()-interval '90 days'),
 bounds as(select exercise_id,max(e1rm_kg) filter(where first_n=1) first_score,max(e1rm_kg) filter(where last_n=1) last_score,max(n) n from growth group by exercise_id)
 insert into public.benchmark_scores(user_id,exercise_id,latest_e1rm_kg,latest_relative_e1rm,latest_at,best_e1rm_kg,best_relative_e1rm,growth_90d_pct,growth_baseline_e1rm_kg,growth_latest_e1rm_kg)
 select p_uid,l.exercise_id,l.e1rm_kg,l.e1rm_kg/l.bodyweight_kg,l.started_at,ss.best_e1rm_kg,ss.best_relative_e1rm,
 case when b.n>=2 then 100*(b.last_score-b.first_score)/b.first_score end,b.first_score,b.last_score
 from latest l join public.strength_scores ss on ss.user_id=p_uid and ss.exercise_id=l.exercise_id left join bounds b on b.exercise_id=l.exercise_id;
 select min(started_at+interval '90 days') into expiry from public._session_strengths(p_uid) where started_at>now()-interval '90 days';
 -- Daily expiry also admits time-gated imports without allowing future scores now.
 update public.strength_cache_state set dirty=false,refresh_after=least(coalesce(expiry,now()+interval '1 day'),now()+interval '1 day') where user_id=p_uid;
end $$;
revoke all on function public._refresh_user_strength(uuid) from public,anon,authenticated;

create function public._refresh_score_cohort(p_scope text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); athlete uuid;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 for athlete in select p.id from public.profiles p left join public.leaderboard_settings ls on ls.user_id=p.id
 left join public.strength_cache_state st on st.user_id=p.id
 where (p.id=uid or (ls.opted_in and (p_scope='platform' or exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=uid and f.addressee_id=p.id) or (f.addressee_id=uid and f.requester_id=p.id))))))
 and (st.user_id is null or st.dirty or st.refresh_after<=now()) order by p.id
 loop perform public._refresh_user_strength(athlete); end loop;
end $$;
revoke all on function public._refresh_score_cohort(text) from public,anon,authenticated;
create or replace function public.refresh_my_strength_scores() returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null then raise exception 'Authentication required'; end if; perform public._refresh_user_strength(auth.uid()); end $$;
create or replace function public.refresh_my_benchmark_scores() returns void language plpgsql security definer set search_path='' as $$
begin perform public.refresh_my_strength_scores(); end $$;
revoke all on function public.refresh_my_benchmark_scores() from public,anon;
grant execute on function public.refresh_my_benchmark_scores() to authenticated;

create or replace function public.get_benchmark_leaderboard(
  p_exercise_id text,
  p_scope text default 'platform',
  p_metric text default 'relative',
  p_limit integer default 25
)
returns table (
  rank_position bigint,
  alias text,
  score numeric,
  metric text,
  cohort_size bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 500);
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if p_scope is null or p_scope not in ('platform','friends') then
    raise exception 'Invalid scope';
  end if;
  if p_metric is null or p_metric not in ('absolute','relative','growth') then
    raise exception 'Invalid metric';
  end if;
  if not exists (
    select 1 from public.benchmark_lifts
    where exercise_id = p_exercise_id and active = true
  ) then
    raise exception 'Unsupported benchmark lift';
  end if;

  perform public._refresh_score_cohort(p_scope);

  return query
  with accepted_friends as (
    select
      case
        when f.requester_id = uid then f.addressee_id
        else f.requester_id
      end as friend_id
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = uid or f.addressee_id = uid)
  ),
  eligible as (
    select
      bs.user_id,
      ls.alias,
      case
        when p_metric = 'absolute' then bs.best_e1rm_kg
        when p_metric = 'relative' then bs.best_relative_e1rm
        else bs.growth_90d_pct
      end as score
    from public.benchmark_scores bs
    join public.leaderboard_settings ls
      on ls.user_id = bs.user_id
      and ls.opted_in = true
      and ls.alias is not null
      and ls.share_benchmark_scores = true
    where bs.exercise_id = p_exercise_id
      and (
        p_scope = 'platform'
        or bs.user_id in (select friend_id from accepted_friends)
        or bs.user_id = uid
      )
      and case
        when p_metric = 'absolute' then bs.best_e1rm_kg is not null
        when p_metric = 'relative' then bs.best_relative_e1rm is not null
        else bs.growth_90d_pct is not null
      end
  ),
  ranked as (
    select
      dense_rank() over (order by e.score desc) as rank_position,
      e.alias,
      e.score,
      count(*) over () as cohort_size
    from eligible e
  )
  select
    r.rank_position,
    r.alias,
    r.score,
    p_metric,
    r.cohort_size
  from ranked r
  order by r.rank_position, lower(r.alias)
  limit safe_limit;
end;
$$;

revoke all on function public.get_benchmark_leaderboard(text,text,text,integer)
  from public, anon;
grant execute on function public.get_benchmark_leaderboard(text,text,text,integer)
  to authenticated;

create or replace function public.get_weekly_trending_exercises(p_limit integer default 10)
returns table (
  rank_position bigint,
  exercise_id text,
  exercise_name text,
  unique_athletes bigint,
  workout_appearances bigint
)
language sql
security definer
set search_path = ''
as $$
  with activity as (
    select
      we.exercise_id,
      count(distinct w.user_id) as unique_athletes,
      count(distinct we.workout_id) as workout_appearances
    from public.workouts w
    join public.workout_exercises we
      on we.workout_id = w.id
      and we.user_id = w.user_id
    join public.leaderboard_settings ls
      on ls.user_id = w.user_id
      and ls.opted_in = true
    where w.ended_at is not null
      and w.started_at >= (date_trunc('week',now() at time zone 'UTC') at time zone 'UTC')
      and w.started_at<=now() and w.ended_at<=now() and auth.uid() is not null
      and exists(select 1 from public.sets s where s.workout_exercise_id=we.id and s.user_id=w.user_id and s.completed_at is not null and s.completed_at<=w.ended_at and s.kind<>'warmup'
       and (coalesce(s.reps,0)>0 or coalesce(s.duration_seconds,0)>0 or coalesce(s.distance_m,0)>0))
    group by we.exercise_id having count(distinct w.user_id)>=3
  ),
  ranked as (
    select
      dense_rank() over (
        order by a.unique_athletes desc, a.workout_appearances desc, e.name
      ) as rank_position,
      a.exercise_id,
      e.name as exercise_name,
      a.unique_athletes,
      a.workout_appearances
    from activity a
    join public.exercises e on e.id = a.exercise_id
  )
  select *
  from ranked
  order by rank_position, exercise_name
  limit least(greatest(coalesce(p_limit,10),1),25);
$$;

revoke all on function public.get_weekly_trending_exercises(integer)
  from public, anon;
grant execute on function public.get_weekly_trending_exercises(integer)
  to authenticated;

create or replace function public.get_weekly_trending_foods(p_limit integer default 10)
returns table (
  rank_position bigint,
  food_name text,
  unique_athletes bigint,
  item_logs bigint
)
language sql
security definer
set search_path = ''
as $$
  with activity as (
    select
      food.id as normalized_name,
      min(food.name) as display_name,
      count(distinct m.user_id) as unique_athletes,
      count(*) as item_logs
    from public.meals m
    join public.meal_items mi
      on mi.meal_id = m.id
      and mi.user_id = m.user_id
    join public.leaderboard_settings ls
      on ls.user_id = m.user_id
      and ls.opted_in = true
    join public.foods food on food.id=mi.food_id
    where m.eaten_at >= (date_trunc('week',now() at time zone 'UTC') at time zone 'UTC')
      and length(trim(mi.name)) > 0
      and m.eaten_at<=now() and auth.uid() is not null
    group by food.id having count(distinct m.user_id)>=3
  ),
  ranked as (
    select
      dense_rank() over (
        order by a.unique_athletes desc, a.item_logs desc, a.display_name
      ) as rank_position,
      a.display_name as food_name,
      a.unique_athletes,
      a.item_logs
    from activity a
  )
  select *
  from ranked
  order by rank_position, food_name
  limit least(greatest(coalesce(p_limit,10),1),25);
$$;

revoke all on function public.get_weekly_trending_foods(integer)
  from public, anon;
grant execute on function public.get_weekly_trending_foods(integer)
  to authenticated;

commit;
