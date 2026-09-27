-- Synthetic-only TC-M06-04 load test. No persistent data: the whole benchmark rolls back.
begin;

insert into private.trees (id, slug, name, data_mode)
values ('17000000-0000-4000-8000-000000000001', 'm06-load-test', 'Synthetic M06 Load Test', 'demo');

insert into private.persons (id, tree_id, code, display_name, name_search, life_status, visibility, protected_minor)
select
  gen_random_uuid(),
  '17000000-0000-4000-8000-000000000001'::uuid,
  format('M06-L-%s', lpad(n::text, 5, '0')),
  format('Phan Synthetic %s', lpad(n::text, 5, '0')),
  format('phan synthetic %s', lpad(n::text, 5, '0')),
  'deceased',
  'public',
  false
from generate_series(1, 10000) as numbers(n);

set local role anon;

 do $$
declare
  v_started timestamptz;
  v_p95 double precision;
  v_count integer;
  v_iteration integer;
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'private' and indexname = 'persons_tree_name_search_id_idx'
  ) then
    raise exception 'canonical name search index is missing';
  end if;

  create temporary table m06_search_timings(milliseconds double precision) on commit drop;
  for v_iteration in 1..20 loop
    v_started := clock_timestamp();
    select count(*) into v_count
    from api.persons_search(
      p_query => 'phan synthetic 09',
      p_sort => 'name',
      p_limit => 100
    );
    insert into m06_search_timings values (extract(epoch from (clock_timestamp() - v_started)) * 1000);
    if v_count > 100 then
      raise exception 'search exceeded max page size: %', v_count;
    end if;
  end loop;

  select percentile_cont(0.95) within group (order by milliseconds)
    into v_p95
  from m06_search_timings;
  raise notice 'M06-04 p95_ms=% samples=%', round(v_p95::numeric, 2), 20;
  if v_p95 > 500 then
    raise exception 'M06-04 p95 exceeded 500ms budget: %', v_p95;
  end if;
end;
$$;

rollback;
