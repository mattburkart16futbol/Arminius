begin;

alter table public.sets
  add column if not exists rir numeric check (rir between 0 and 10);

commit;
