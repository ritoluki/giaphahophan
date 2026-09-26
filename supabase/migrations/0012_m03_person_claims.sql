-- M03-04 person/account claim.
-- A person row never creates an auth user. A claim only links an existing,
-- already-active membership after an independent reviewer approves it.

begin;

create table if not exists private.person_claims (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  membership_id uuid not null,
  person_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reason text,
  unique (tree_id, id),
  foreign key (tree_id, membership_id) references private.memberships(tree_id, id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id),
  check (reviewed_by is null or reviewed_by <> created_by)
);

create unique index if not exists person_claims_open_person_idx
  on private.person_claims (tree_id, person_id)
  where status in ('pending', 'approved');

create unique index if not exists person_claims_open_membership_idx
  on private.person_claims (tree_id, membership_id)
  where status in ('pending', 'approved');

drop trigger if exists touch_person_claims on private.person_claims;
create trigger touch_person_claims
before update on private.person_claims
for each row execute function private.touch_updated_at();

alter table private.person_claims enable row level security;
alter table private.person_claims force row level security;
revoke all on table private.person_claims from public, anon, authenticated;

create or replace function private.person_claim_submit_authorized(
  p_tree_id uuid,
  p_person_id uuid,
  p_reason text
)
returns table (
  id uuid,
  tree_id uuid,
  status text,
  version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_membership private.memberships%rowtype;
  v_claim private.person_claims%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if not private.has_capability(p_tree_id, 'proposal.submit', null) then
    raise exception using errcode = '42501', message = 'claim submit capability required';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 4000 then
    raise exception using errcode = '22023', message = 'claim reason is required and must be <= 4000 characters';
  end if;

  select *
  into v_membership
  from private.memberships as m
  where m.tree_id = p_tree_id
    and m.auth_user_id = v_actor
    and m.status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'active membership required';
  end if;
  if v_membership.person_id is not null then
    raise exception using errcode = '23505', message = 'membership is already linked to a person';
  end if;
  if not exists (
    select 1 from private.persons as p
    where p.tree_id = p_tree_id and p.id = p_person_id
  ) then
    raise exception using errcode = 'P0002', message = 'person not found';
  end if;
  if exists (
    select 1 from private.memberships as m
    where m.tree_id = p_tree_id and m.person_id = p_person_id and m.status in ('active', 'pending')
  ) then
    raise exception using errcode = '23505', message = 'person is already linked to a membership';
  end if;

  insert into private.person_claims (
    tree_id, created_by, membership_id, person_id, reason
  ) values (
    p_tree_id, v_actor, v_membership.id, p_person_id, btrim(p_reason)
  )
  returning * into v_claim;

  insert into private.audit_events (
    tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
  ) values (
    p_tree_id, v_actor, 'person_claim.submitted', 'person_claim', v_claim.id, gen_random_uuid(),
    'Synthetic person claim submitted for independent review'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    p_tree_id, 'person_claim.submitted', v_claim.id, v_claim.version,
    'person_claim.submitted:' || v_claim.id::text || ':' || v_claim.version::text, v_actor
  );

  return query select v_claim.id, v_claim.tree_id, v_claim.status, v_claim.version;
end;
$$;

create or replace function private.person_claim_review_authorized(
  p_claim_id uuid,
  p_decision text,
  p_reason text,
  p_base_version bigint
)
returns table (
  id uuid,
  tree_id uuid,
  status text,
  version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_claim private.person_claims%rowtype;
  v_membership private.memberships%rowtype;
  v_tree_id uuid;
  v_updated integer;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'unsupported claim decision';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 4000 then
    raise exception using errcode = '22023', message = 'review reason is required and must be <= 4000 characters';
  end if;

  select c.tree_id
  into v_tree_id
  from private.person_claims as c
  where c.id = p_claim_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'person claim not found';
  end if;
  if not private.has_capability(v_tree_id, 'proposal.review', null) then
    raise exception using errcode = '42501', message = 'claim review capability required';
  end if;

  select c.*
  into v_claim
  from private.person_claims as c
  where c.id = p_claim_id
    and c.tree_id = v_tree_id
  for update;
  select * into v_membership
  from private.memberships as m
  where m.tree_id = v_tree_id and m.id = v_claim.membership_id
  for update;

  if v_claim.created_by = v_actor or v_membership.auth_user_id = v_actor then
    raise exception using errcode = '42501', message = 'claim requester cannot review own claim';
  end if;
  if v_claim.status <> 'pending' or v_claim.version <> p_base_version then
    raise exception using errcode = 'P0009', message = 'claim is stale or no longer pending';
  end if;

  if p_decision = 'approve' then
    update private.memberships as m
    set person_id = v_claim.person_id
    where m.tree_id = v_tree_id
      and m.id = v_claim.membership_id
      and m.status = 'active'
      and m.person_id is null;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception using errcode = 'P0009', message = 'membership is no longer claimable';
    end if;
  end if;

  update private.person_claims as c
  set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      reviewed_by = v_actor,
      reason = btrim(p_reason)
  where c.id = p_claim_id
  returning c.* into v_claim;

  insert into private.audit_events (
    tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
  ) values (
    v_tree_id, v_actor, 'person_claim.' || p_decision, 'person_claim', v_claim.id, gen_random_uuid(),
    'Synthetic person claim reviewed without automatic capability grant'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    v_tree_id, 'person_claim.' || p_decision, v_claim.id, v_claim.version,
    'person_claim.' || p_decision || ':' || v_claim.id::text || ':' || v_claim.version::text, v_actor
  );

  return query select v_claim.id, v_claim.tree_id, v_claim.status, v_claim.version;
end;
$$;

create or replace function private.person_claim_submit_idempotent(
  p_tree_id uuid,
  p_person_id uuid,
  p_reason text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (id uuid, tree_id uuid, status text, version bigint)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_existing private.idempotency_records%rowtype;
  v_result record;
  v_inserted integer;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;
  delete from private.idempotency_records as r
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'person.claim.submit'
    and r.idempotency_key = p_idempotency_key and r.expires_at <= clock_timestamp();
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values (p_tree_id, v_actor, 'person.claim.submit', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours')
  on conflict on constraint idempotency_records_tree_id_actor_id_operation_idempotency__key do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from private.idempotency_records as r
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'person.claim.submit'
    and r.idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'treeId')::uuid, v_existing.response->>'status', (v_existing.response->>'version')::bigint;
    return;
  end if;
  select * into v_result from private.person_claim_submit_authorized(p_tree_id, p_person_id, p_reason);
  update private.idempotency_records as r set response = jsonb_build_object('id', v_result.id, 'treeId', v_result.tree_id, 'status', v_result.status, 'version', v_result.version)
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'person.claim.submit' and r.idempotency_key = p_idempotency_key;
  return query select v_result.id, v_result.tree_id, v_result.status, v_result.version;
end;
$$;

create or replace function private.person_claim_review_idempotent(
  p_claim_id uuid,
  p_decision text,
  p_reason text,
  p_base_version bigint,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (id uuid, tree_id uuid, status text, version bigint)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_tree_id uuid;
  v_existing private.idempotency_records%rowtype;
  v_result record;
  v_inserted integer;
begin
  select c.tree_id into v_tree_id from private.person_claims as c where c.id = p_claim_id;
  if not found then raise exception using errcode = 'P0002', message = 'person claim not found'; end if;
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;
  delete from private.idempotency_records as r
  where r.tree_id = v_tree_id and r.actor_id = v_actor and r.operation = 'person.claim.review'
    and r.idempotency_key = p_idempotency_key and r.expires_at <= clock_timestamp();
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values (v_tree_id, v_actor, 'person.claim.review', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours')
  on conflict on constraint idempotency_records_tree_id_actor_id_operation_idempotency__key do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from private.idempotency_records as r
  where r.tree_id = v_tree_id and r.actor_id = v_actor and r.operation = 'person.claim.review'
    and r.idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'treeId')::uuid, v_existing.response->>'status', (v_existing.response->>'version')::bigint;
    return;
  end if;
  select * into v_result from private.person_claim_review_authorized(p_claim_id, p_decision, p_reason, p_base_version);
  update private.idempotency_records as r set response = jsonb_build_object('id', v_result.id, 'treeId', v_result.tree_id, 'status', v_result.status, 'version', v_result.version)
  where r.tree_id = v_tree_id and r.actor_id = v_actor and r.operation = 'person.claim.review' and r.idempotency_key = p_idempotency_key;
  return query select v_result.id, v_result.tree_id, v_result.status, v_result.version;
end;
$$;

create or replace function api.person_claim_submit_idempotent(
  p_tree_id uuid, p_person_id uuid, p_reason text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, tree_id uuid, status text, version bigint)
language sql security invoker set search_path = pg_catalog
as $$ select * from private.person_claim_submit_idempotent(p_tree_id, p_person_id, p_reason, p_idempotency_key, p_request_hash); $$;

create or replace function api.person_claim_review_idempotent(
  p_claim_id uuid, p_decision text, p_reason text, p_base_version bigint, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, tree_id uuid, status text, version bigint)
language sql security invoker set search_path = pg_catalog
as $$ select * from private.person_claim_review_idempotent(p_claim_id, p_decision, p_reason, p_base_version, p_idempotency_key, p_request_hash); $$;

revoke all on function private.person_claim_submit_authorized(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.person_claim_review_authorized(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function private.person_claim_submit_idempotent(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function private.person_claim_review_idempotent(uuid, text, text, bigint, uuid, text) from public, anon, authenticated;
revoke all on function api.person_claim_submit_idempotent(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function api.person_claim_review_idempotent(uuid, text, text, bigint, uuid, text) from public, anon, authenticated;
grant execute on function api.person_claim_submit_idempotent(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function api.person_claim_review_idempotent(uuid, text, text, bigint, uuid, text) to authenticated;
grant execute on function private.person_claim_submit_idempotent(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function private.person_claim_review_idempotent(uuid, text, text, bigint, uuid, text) to authenticated;

comment on table private.person_claims is 'Account-to-person claims; approval links an existing membership only and never creates auth or capability.';

commit;
