begin;
alter table public.workouts add column revision integer not null default 0;
alter table public.workouts add column last_request_id uuid;
alter table public.sets drop constraint sets_check;
alter table public.sets add constraint sets_completed_measurement check (
  completed_at is null or coalesce(reps > 0,false) or coalesce(duration_seconds > 0,false) or coalesce(distance_m > 0,false)
);

-- One transactional snapshot. Invoker security preserves grants and RLS.
-- Revision checking prevents lost updates; request IDs make network retries idempotent.
create function public.save_workout(p_id uuid,p_revision integer,p_name text,p_exercises jsonb,p_finish boolean,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_workout public.workouts%rowtype;
  lift jsonb; entry jsonb; info public.exercises%rowtype;
  lift_position integer := 0; set_position integer; completed integer := 0;
  lift_id uuid; set_id uuid; reps_value integer; duration_value integer; distance_value numeric;
  completion timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_id is null or p_request_id is null or p_revision is null or p_finish is null then raise exception 'Missing save parameters'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 200 then raise exception 'Invalid workout name'; end if;
  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array' then raise exception 'Exercises must be an array'; end if;
  if jsonb_array_length(p_exercises)>50 then raise exception 'Maximum 50 exercises'; end if;
  select * into current_workout from public.workouts where id=p_id for update;
  if found then
    if current_workout.last_request_id=p_request_id then
      return jsonb_build_object('revision',current_workout.revision,'ended_at',current_workout.ended_at,'started_at',current_workout.started_at);
    end if;
    if current_workout.revision<>p_revision or current_workout.ended_at is not null then
      raise exception 'Workout changed; reload before saving' using errcode='40001';
    end if;
  else
    if p_revision<>0 then raise exception 'Workout changed; reload before saving' using errcode='40001'; end if;
    insert into public.workouts(id,user_id,name) values(p_id,auth.uid(),trim(p_name)) returning * into current_workout;
  end if;
  delete from public.workout_exercises where workout_id=p_id;
  for lift in select value from jsonb_array_elements(p_exercises) loop
    lift_id := (lift->>'id')::uuid;
    select * into info from public.exercises where id=lift->>'exercise_id';
    if not found then raise exception 'Unknown exercise'; end if;
    if not (lift ? 'sets') or jsonb_typeof(lift->'sets')<>'array' then raise exception 'Sets must be an array'; end if;
    if jsonb_array_length(lift->'sets')>100 then raise exception 'Maximum 100 sets per exercise'; end if;
    insert into public.workout_exercises(id,user_id,workout_id,exercise_id,position)
      values(lift_id,auth.uid(),p_id,info.id,lift_position);
    set_position := 0;
    for entry in select value from jsonb_array_elements(lift->'sets') loop
      set_id := (entry->>'id')::uuid;
      reps_value := (entry->>'reps')::integer;
      duration_value := (entry->>'duration_seconds')::integer;
      distance_value := (entry->>'distance_m')::numeric;
      completion := (entry->>'completed_at')::timestamptz;
      if (entry->>'weight_kg')::numeric > 2000 then raise exception 'Weight above supported range'; end if;
      if completion is not null then
        if (info.tracking_mode='reps' and coalesce(reps_value,0)<=0) or
           (info.tracking_mode='time' and coalesce(duration_value,0)<=0) or
           (info.tracking_mode='distance' and coalesce(distance_value,0)<=0) then raise exception 'Completed set requires its tracking measurement'; end if;
        completed := completed+1;
      end if;
      insert into public.sets(id,user_id,workout_exercise_id,position,kind,reps,weight_kg,duration_seconds,distance_m,rpe,rir,completed_at)
      values(set_id,auth.uid(),lift_id,set_position,entry->>'kind',reps_value,(entry->>'weight_kg')::numeric,
        duration_value,distance_value,(entry->>'rpe')::numeric,(entry->>'rir')::numeric,completion);
      set_position := set_position+1;
    end loop;
    lift_position := lift_position+1;
  end loop;
  if p_finish and completed=0 then raise exception 'Complete at least one set'; end if;
  update public.workouts set name=trim(p_name),revision=revision+1,last_request_id=p_request_id,
    ended_at=case when p_finish then now() else null end
    where id=p_id returning * into current_workout;
  return jsonb_build_object('revision',current_workout.revision,'ended_at',current_workout.ended_at,'started_at',current_workout.started_at);
end;
$$;
revoke all on function public.save_workout(uuid,integer,text,jsonb,boolean,uuid) from public,anon;
grant execute on function public.save_workout(uuid,integer,text,jsonb,boolean,uuid) to authenticated;
commit;
