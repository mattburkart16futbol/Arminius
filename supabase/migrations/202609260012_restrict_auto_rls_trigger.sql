-- The dashboard's automatic-RLS event trigger is internal infrastructure.
-- Some projects create it in public with default API EXECUTE grants.
begin;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

commit;

