begin;
alter table public.foods add column search_exclusion_reason text;
-- Preserve the row and existing references, but do not present a mixed gift bundle as cola.
update public.foods set search_exclusion_reason='Mixed gift bundle, not a single beverage'
where source='USDA FoodData Central' and source_id='1998183';
create or replace function public.search_foods(p_query text,p_offset integer default 0)
returns setof public.foods language sql stable security invoker set search_path='' as $$
 with query as (
   select trim(regexp_replace(lower(trim(coalesce(p_query,''))),'[^a-z0-9]+',' ','g')) term
 ), searchable as (
   select f.id,
     trim(regexp_replace(lower(f.name),'[^a-z0-9]+',' ','g')) product,
     trim(regexp_replace(lower(f.name || ' ' ||
       case when coalesce(f.brand,'') ~* '(company|corporation|[0-9]{8,})' then '' else coalesce(f.brand,'') end
       || ' ' || coalesce(f.gtin_upc,'')),'[^a-z0-9]+',' ','g')) keywords
   from public.foods f where f.search_exclusion_reason is null
 )
 select f.* from public.foods f join searchable s on s.id=f.id cross join query q
 where length(trim(coalesce(p_query,''))) between 2 and 100 and q.term<>''
 and not exists(select 1 from regexp_split_to_table(q.term,' +') word where strpos(s.keywords,word)=0)
 order by case when s.product=q.term then 0 when strpos(s.product,q.term)>0 then 1 else 2 end,
 f.name,f.id limit 50 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;
revoke all on function public.search_foods(text,integer) from public,anon;
grant execute on function public.search_foods(text,integer) to authenticated;
commit;
