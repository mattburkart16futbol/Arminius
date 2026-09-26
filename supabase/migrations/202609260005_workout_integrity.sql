begin;

-- Prevent accidental double-starts / multiple active sessions for one account.
do $$ begin
 if exists(select 1 from public.workouts where ended_at is null group by user_id having count(*)>1) then
 raise exception 'Multiple active workouts exist for an account. Finish or discard duplicates before applying this update.';
 end if;
end $$;

create unique index if not exists workouts_one_active_per_user_idx
  on public.workouts(user_id)
  where ended_at is null;

commit;
