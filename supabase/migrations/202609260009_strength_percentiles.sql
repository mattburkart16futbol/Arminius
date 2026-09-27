-- Privacy-safe relative-strength scoring and aggregate percentiles.
-- Raw cross-user workout/bodyweight records remain inaccessible to clients.
begin;
-- Named boards require separate consent; existing aggregate opt-in is not repurposed.
alter table public.leaderboard_settings add column share_benchmark_scores boolean not null default false;
alter table public.leaderboard_settings add constraint leaderboard_named_consent check (not share_benchmark_scores or opted_in);
alter table public.leaderboard_settings add constraint leaderboard_alias_trimmed check(alias is null or (alias=trim(alias) and length(trim(alias)) between 2 and 40));


create unique index if not exists leaderboard_alias_unique_idx
  on public.leaderboard_settings (lower(alias))
  where alias is not null;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_unique_pair_idx
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

create index if not exists friendships_requester_idx
  on public.friendships(requester_id, status);
create index if not exists friendships_addressee_idx
  on public.friendships(addressee_id, status);

create table if not exists public.strength_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null references public.exercises(id) on delete cascade,
  best_e1rm_kg numeric check (best_e1rm_kg > 0),
  best_e1rm_at timestamptz,
  best_relative_e1rm numeric check (best_relative_e1rm > 0),
  relative_bodyweight_kg numeric check (relative_bodyweight_kg > 0),
  best_relative_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.strength_scores enable row level security;
revoke all on public.strength_scores from anon, authenticated;
grant select on public.strength_scores to authenticated;

drop policy if exists strength_score_owner_read on public.strength_scores;
create policy strength_score_owner_read
  on public.strength_scores
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists strength_scores_exercise_idx
  on public.strength_scores(exercise_id);

create or replace function public.refresh_my_strength_scores()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  delete from public.strength_scores where user_id = uid;

  with valid_sets as (
    select
      we.exercise_id,
      w.started_at,
      s.weight_kg,
      s.reps,
      (s.weight_kg * (1 + s.reps::numeric / 30)) as e1rm_kg,
      bw.weight_kg as bodyweight_kg
    from public.sets s
    join public.workout_exercises we
      on we.id = s.workout_exercise_id
      and we.user_id = uid
    join public.workouts w
      on w.id = we.workout_id
      and w.user_id = uid
    left join lateral (
      select bm.weight_kg
      from public.body_metrics bm
      where bm.user_id = uid
        and bm.weight_kg is not null
        and bm.measured_at <= w.started_at
        and bm.measured_at >= w.started_at - interval '90 days'
      order by bm.measured_at desc
      limit 1
    ) bw on true
    where s.user_id = uid
      and w.ended_at is not null
      and s.completed_at is not null
      and s.kind <> 'warmup'
      and s.weight_kg is not null
      and s.weight_kg > 0
      and s.reps between 1 and 12
  ),
  absolute_best as (
    select distinct on (exercise_id)
      exercise_id,
      e1rm_kg as best_e1rm_kg,
      started_at as best_e1rm_at
    from valid_sets
    order by exercise_id, e1rm_kg desc, started_at asc
  ),
  relative_best as (
    select distinct on (exercise_id)
      exercise_id,
      (e1rm_kg / bodyweight_kg) as best_relative_e1rm,
      bodyweight_kg as relative_bodyweight_kg,
      started_at as best_relative_at
    from valid_sets
    where bodyweight_kg is not null
      and bodyweight_kg > 0
    order by exercise_id, (e1rm_kg / bodyweight_kg) desc, started_at asc
  )
  insert into public.strength_scores (
    user_id,
    exercise_id,
    best_e1rm_kg,
    best_e1rm_at,
    best_relative_e1rm,
    relative_bodyweight_kg,
    best_relative_at,
    updated_at
  )
  select
    uid,
    coalesce(a.exercise_id, r.exercise_id),
    a.best_e1rm_kg,
    a.best_e1rm_at,
    r.best_relative_e1rm,
    r.relative_bodyweight_kg,
    r.best_relative_at,
    now()
  from absolute_best a
  full outer join relative_best r using (exercise_id);
end;
$$;

revoke all on function public.refresh_my_strength_scores() from public, anon;
grant execute on function public.refresh_my_strength_scores() to authenticated;

create or replace function public.send_friend_request_by_alias(target_alias text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  target_user_id uuid;
  result_id uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.leaderboard_settings mine
    where mine.user_id = uid
      and mine.opted_in = true
      and mine.alias is not null
  ) then
    raise exception 'Enable an alias and opt in before adding friends';
  end if;

  select ls.user_id into target_user_id
  from public.leaderboard_settings ls
  where ls.opted_in = true
    and ls.alias is not null
    and lower(ls.alias) = lower(trim(target_alias))
  limit 1;

  if target_user_id is null or target_user_id = uid then
    raise exception 'Friend alias not found';
  end if;

  select f.id into result_id
  from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(uid, target_user_id)
    and greatest(f.requester_id, f.addressee_id) = greatest(uid, target_user_id)
  limit 1;

  if result_id is not null then
    -- A declined request cannot silently look like a newly sent request.
    if exists(select 1 from public.friendships where id=result_id and status='declined') then raise exception 'Request was declined; remove the connection before requesting again'; end if;
    return result_id;
  end if;

  perform 1 from public.profiles where id in (uid,target_user_id) order by id for update;
  insert into public.friendships(requester_id, addressee_id)
  values(uid, target_user_id)
  on conflict do nothing
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.send_friend_request_by_alias(text) from public, anon;
grant execute on function public.send_friend_request_by_alias(text) to authenticated;

create or replace function public.get_my_friendships()
returns table (
  friendship_id uuid,
  friend_alias text,
  status text,
  direction text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    f.id,
    other.alias,
    f.status,
    case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
    f.created_at
  from public.friendships f
  join public.leaderboard_settings other
    on other.user_id = case
      when f.requester_id = auth.uid() then f.addressee_id
      else f.requester_id
    end
  where (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and other.opted_in = true
    and other.alias is not null
  order by f.created_at desc;
$$;

revoke all on function public.get_my_friendships() from public, anon;
grant execute on function public.get_my_friendships() to authenticated;

create or replace function public.respond_friend_request(
  friendship_id uuid,
  accept_request boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  update public.friendships
  set
    status = case when accept_request then 'accepted' else 'declined' end,
    responded_at = now()
  where id = friendship_id
    and addressee_id = uid
    and status = 'pending';

  if not found then
    raise exception 'Pending friend request not found';
  end if;
end;
$$;

revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

create or replace function public.remove_friendship(friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  delete from public.friendships
  where id = friendship_id
    and (requester_id = uid or addressee_id = uid);

  if not found then
    raise exception 'Friendship not found';
  end if;
end;
$$;

revoke all on function public.remove_friendship(uuid) from public, anon;
grant execute on function public.remove_friendship(uuid) to authenticated;

create or replace function public.get_my_strength_percentiles(p_exercise_id text)
returns table (
  own_e1rm_kg numeric,
  own_relative_e1rm numeric,
  platform_absolute_percentile numeric,
  platform_relative_percentile numeric,
  platform_absolute_n bigint,
  platform_relative_n bigint,
  friend_absolute_percentile numeric,
  friend_relative_percentile numeric,
  friend_absolute_n bigint,
  friend_relative_n bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  my_abs numeric;
  my_rel numeric;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  perform public._refresh_score_cohort('platform');

  select ss.best_e1rm_kg, ss.best_relative_e1rm
    into my_abs, my_rel
  from public.strength_scores ss
  where ss.user_id = uid
    and ss.exercise_id = p_exercise_id;

  return query
  with platform as (
    select ss.best_e1rm_kg, ss.best_relative_e1rm
    from public.strength_scores ss
    join public.leaderboard_settings ls
      on ls.user_id = ss.user_id
      and ls.opted_in = true
    where ss.exercise_id = p_exercise_id
      and ss.user_id <> uid
  ),
  accepted_friends as (
    select
      case
        when f.requester_id = uid then f.addressee_id
        else f.requester_id
      end as friend_id
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = uid or f.addressee_id = uid)
  ),
  friends as (
    select ss.best_e1rm_kg, ss.best_relative_e1rm
    from public.strength_scores ss
    join accepted_friends af on af.friend_id = ss.user_id
    join public.leaderboard_settings ls
      on ls.user_id = ss.user_id
      and ls.opted_in = true
    where ss.exercise_id = p_exercise_id
  )
  select
    my_abs,
    my_rel,
    case
      when my_abs is null or count(p.best_e1rm_kg) < 5 then null
      else 100 * (
        count(*) filter (where p.best_e1rm_kg < my_abs)
        + 0.5 * count(*) filter (where p.best_e1rm_kg = my_abs)
      )::numeric / count(p.best_e1rm_kg)
    end,
    case
      when my_rel is null or count(p.best_relative_e1rm) < 5 then null
      else 100 * (
        count(*) filter (where p.best_relative_e1rm < my_rel)
        + 0.5 * count(*) filter (where p.best_relative_e1rm = my_rel)
      )::numeric / count(p.best_relative_e1rm)
    end,
    count(p.best_e1rm_kg),
    count(p.best_relative_e1rm),
    (
      select case
        when my_abs is null or count(f.best_e1rm_kg) < 5 then null
        else 100 * (
          count(*) filter (where f.best_e1rm_kg < my_abs)
          + 0.5 * count(*) filter (where f.best_e1rm_kg = my_abs)
        )::numeric / count(f.best_e1rm_kg)
      end
      from friends f
    ),
    (
      select case
        when my_rel is null or count(f.best_relative_e1rm) < 5 then null
        else 100 * (
          count(*) filter (where f.best_relative_e1rm < my_rel)
          + 0.5 * count(*) filter (where f.best_relative_e1rm = my_rel)
        )::numeric / count(f.best_relative_e1rm)
      end
      from friends f
    ),
    (select count(f.best_e1rm_kg) from friends f),
    (select count(f.best_relative_e1rm) from friends f)
  from platform p;
end;
$$;

revoke all on function public.get_my_strength_percentiles(text) from public, anon;
grant execute on function public.get_my_strength_percentiles(text) to authenticated;

commit;
