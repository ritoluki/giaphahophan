-- JOBS-01: least-privilege transactional outbox dispatcher.
-- Only the dedicated service_role may claim, complete or retry outbox work.

begin;

alter table private.outbox
  add column status text not null default 'pending'
    check (status in ('pending', 'claimed', 'published', 'failed')),
  add column available_at timestamptz not null default clock_timestamp(),
  add column claimed_by uuid,
  add column claimed_at timestamptz,
  add column lease_until timestamptz,
  add column max_attempts integer not null default 5
    check (max_attempts between 1 and 20);

update private.outbox
set status = case when published_at is null then 'pending' else 'published' end,
    available_at = coalesce(available_at, created_at);

create index outbox_dispatch_idx
  on private.outbox (status, available_at, created_at, id);

create or replace function jobs.outbox_claim(
  p_worker_id uuid,
  p_limit integer default 25,
  p_lease_seconds integer default 60
)
returns table (
  id uuid,
  tree_id uuid,
  event_type text,
  resource_id uuid,
  resource_version bigint,
  dedupe_key text,
  requested_by uuid,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog, private, jobs
as $$
declare
  v_row record;
begin
  if p_worker_id is null then
    raise exception using errcode = '22023', message = 'worker id is required';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'claim limit is outside the allowed range';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 3600 then
    raise exception using errcode = '22023', message = 'lease duration is outside the allowed range';
  end if;

  for v_row in
    select o.*
    from private.outbox as o
    where (
      (o.status = 'pending' and o.available_at <= clock_timestamp())
      or (o.status = 'failed' and o.attempts < o.max_attempts and o.available_at <= clock_timestamp())
      or (o.status = 'claimed' and o.lease_until <= clock_timestamp())
    )
    order by o.created_at, o.id
    limit p_limit
    for update skip locked
  loop
    update private.outbox as o
    set status = 'claimed',
        claimed_by = p_worker_id,
        claimed_at = clock_timestamp(),
        lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
        attempts = o.attempts + 1,
        last_error_code = null
    where o.id = v_row.id
    returning o.id, o.tree_id, o.event_type, o.resource_id, o.resource_version,
      o.dedupe_key, o.requested_by, o.attempts, o.max_attempts
    into id, tree_id, event_type, resource_id, resource_version,
      dedupe_key, requested_by, attempts, max_attempts;
    return next;
  end loop;
end;
$$;

create or replace function jobs.outbox_mark_published(
  p_event_id uuid,
  p_worker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, jobs
as $$
declare
  v_updated boolean;
begin
  update private.outbox as o
  set status = 'published',
      published_at = coalesce(o.published_at, clock_timestamp()),
      claimed_by = null,
      claimed_at = null,
      lease_until = null
  where o.id = p_event_id
    and o.status = 'claimed'
    and o.claimed_by = p_worker_id
  returning true into v_updated;
  return coalesce(v_updated, false);
end;
$$;

create or replace function jobs.outbox_mark_failed(
  p_event_id uuid,
  p_worker_id uuid,
  p_error_code text,
  p_retry_delay_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, jobs
as $$
declare
  v_updated boolean;
begin
  if nullif(btrim(p_error_code), '') is null or length(p_error_code) > 100 then
    raise exception using errcode = '22023', message = 'outbox error code is required';
  end if;
  if p_retry_delay_seconds < 0 or p_retry_delay_seconds > 86400 then
    raise exception using errcode = '22023', message = 'retry delay is outside the allowed range';
  end if;

  update private.outbox as o
  set status = 'failed',
      available_at = clock_timestamp() + make_interval(secs => p_retry_delay_seconds),
      last_error_code = btrim(p_error_code),
      claimed_by = null,
      claimed_at = null,
      lease_until = null
  where o.id = p_event_id
    and o.status = 'claimed'
    and o.claimed_by = p_worker_id
  returning true into v_updated;
  return coalesce(v_updated, false);
end;
$$;

revoke all on function jobs.outbox_claim(uuid, integer, integer) from public, anon, authenticated;
revoke all on function jobs.outbox_mark_published(uuid, uuid) from public, anon, authenticated;
revoke all on function jobs.outbox_mark_failed(uuid, uuid, text, integer) from public, anon, authenticated;
grant usage on schema jobs to service_role;
grant execute on function jobs.outbox_claim(uuid, integer, integer) to service_role;
grant execute on function jobs.outbox_mark_published(uuid, uuid) to service_role;
grant execute on function jobs.outbox_mark_failed(uuid, uuid, text, integer) to service_role;

commit;
