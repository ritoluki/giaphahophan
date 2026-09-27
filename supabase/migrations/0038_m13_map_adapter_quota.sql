-- M13-04 provider gate quota. No provider call is enabled by this migration.
begin;

create table private.map_provider_quota_windows (
  tree_id uuid not null references private.trees(id) on delete cascade,
  provider text not null check (provider in ('google_maps', 'openstreetmap')),
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (tree_id, provider, window_kind, window_start)
);

alter table private.map_provider_quota_windows enable row level security;
alter table private.map_provider_quota_windows force row level security;
revoke all on table private.map_provider_quota_windows from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on table private.map_provider_quota_windows to service_role;

create or replace function private.map_provider_quota_consume(
  p_tree_id uuid,
  p_provider text,
  p_minute_bucket timestamptz,
  p_day_bucket timestamptz,
  p_minute_limit integer,
  p_day_limit integer
)
returns table (allowed boolean, minute_used integer, day_used integer)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_minute_used integer;
  v_day_used integer;
begin
  if p_minute_limit < 1 or p_day_limit < p_minute_limit then
    raise exception using errcode = '22023', message = 'map provider quota is invalid';
  end if;
  if p_provider not in ('google_maps', 'openstreetmap') then
    raise exception using errcode = '22023', message = 'map provider is invalid';
  end if;
  if not exists (select 1 from private.trees t where t.id = p_tree_id) then
    raise exception using errcode = 'P0002', message = 'tree not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tree_id::text || ':' || p_provider, 0));
  insert into private.map_provider_quota_windows (tree_id, provider, window_kind, window_start)
  values (p_tree_id, p_provider, 'minute', p_minute_bucket), (p_tree_id, p_provider, 'day', p_day_bucket)
  on conflict (tree_id, provider, window_kind, window_start) do nothing;

  select q.request_count into v_minute_used
  from private.map_provider_quota_windows q
  where q.tree_id = p_tree_id and q.provider = p_provider and q.window_kind = 'minute' and q.window_start = p_minute_bucket
  for update;
  select q.request_count into v_day_used
  from private.map_provider_quota_windows q
  where q.tree_id = p_tree_id and q.provider = p_provider and q.window_kind = 'day' and q.window_start = p_day_bucket
  for update;

  if v_minute_used >= p_minute_limit or v_day_used >= p_day_limit then
    return query select false, v_minute_used, v_day_used;
    return;
  end if;

  update private.map_provider_quota_windows
  set request_count = request_count + 1, updated_at = clock_timestamp()
  where tree_id = p_tree_id and provider = p_provider and window_kind = 'minute' and window_start = p_minute_bucket;
  update private.map_provider_quota_windows
  set request_count = request_count + 1, updated_at = clock_timestamp()
  where tree_id = p_tree_id and provider = p_provider and window_kind = 'day' and window_start = p_day_bucket;
  return query select true, v_minute_used + 1, v_day_used + 1;
end;
$$;

revoke all on function private.map_provider_quota_consume(uuid,text,timestamptz,timestamptz,integer,integer) from public, anon, authenticated;
grant execute on function private.map_provider_quota_consume(uuid,text,timestamptz,timestamptz,integer,integer) to service_role;

commit;