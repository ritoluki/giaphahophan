-- M15-01: scholarship programs and application workflow.
-- Program criteria is public content; applications and evidence remain private projections.
begin;

create table private.scholarship_programs (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  fund_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 500),
  criteria text not null check (length(btrim(criteria)) between 1 and 20000),
  closes_at timestamptz,
  status text not null check (status in ('draft', 'open', 'closed', 'awarded')),
  unique (tree_id, id),
  foreign key (tree_id, fund_id) references private.funds(tree_id, id)
);

create table private.scholarship_applications (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  program_id uuid not null,
  person_id uuid not null,
  submitted_by uuid not null references auth.users(id),
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'needs_info', 'approved', 'rejected', 'withdrawn', 'awarded')),
  statement text not null check (length(btrim(statement)) between 1 and 20000),
  evidence_asset_id uuid not null,
  unique (tree_id, id),
  unique (tree_id, program_id, person_id),
  foreign key (tree_id, program_id) references private.scholarship_programs(tree_id, id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id),
  foreign key (tree_id, evidence_asset_id) references private.media_assets(tree_id, id)
);

create index scholarship_programs_tree_status_idx on private.scholarship_programs (tree_id, status, closes_at);
create index scholarship_applications_program_status_idx on private.scholarship_applications (tree_id, program_id, status, created_at);
create index scholarship_applications_submitter_idx on private.scholarship_applications (tree_id, submitted_by, created_at desc);

drop trigger if exists touch_scholarship_programs on private.scholarship_programs;
create trigger touch_scholarship_programs before update on private.scholarship_programs
for each row execute function private.touch_updated_at();
drop trigger if exists touch_scholarship_applications on private.scholarship_applications;
create trigger touch_scholarship_applications before update on private.scholarship_applications
for each row execute function private.touch_updated_at();

alter table private.scholarship_programs enable row level security;
alter table private.scholarship_programs force row level security;
alter table private.scholarship_applications enable row level security;
alter table private.scholarship_applications force row level security;

create or replace function private.scholarship_program_list_authorized(p_tree_id uuid)
returns table (id uuid, version bigint, fund_id uuid, title text, criteria text, closes_at timestamptz, status text)
language plpgsql stable security definer set search_path = pg_catalog, private
as $$
begin
  if auth.uid() is null or not private.is_active_member(p_tree_id) then
    raise exception using errcode = '42501', message = 'active tree membership required';
  end if;
  return query
    select p.id, p.version, p.fund_id, p.title, p.criteria, p.closes_at, p.status
    from private.scholarship_programs p
    where p.tree_id = p_tree_id
      and (p.status <> 'draft' or private.has_capability(p_tree_id, 'scholarship.manage', null))
    order by p.closes_at nulls last, p.created_at desc, p.id;
end;
$$;

create or replace function private.scholarship_program_create_idempotent(
  p_tree_id uuid, p_fund_id uuid, p_title text, p_criteria text, p_closes_at timestamptz,
  p_status text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, version bigint, fund_id uuid, title text, criteria text, closes_at timestamptz, status text)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_existing private.idempotency_records%rowtype;
  v_program private.scholarship_programs%rowtype;
  v_inserted integer;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if not private.has_capability(p_tree_id, 'scholarship.manage', null) then raise exception using errcode = '42501', message = 'scholarship management capability required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then raise exception using errcode = '22023', message = 'idempotency key and request hash are required'; end if;
  if p_status not in ('draft', 'open') then raise exception using errcode = '22023', message = 'program creation supports draft or open status only'; end if;
  if nullif(btrim(p_title), '') is null or length(btrim(p_title)) > 500 then raise exception using errcode = '22023', message = 'program title is required and must be <= 500 characters'; end if;
  if nullif(btrim(p_criteria), '') is null or length(btrim(p_criteria)) > 20000 then raise exception using errcode = '22023', message = 'program criteria is required and must be <= 20000 characters'; end if;
  if p_closes_at is not null and p_closes_at <= clock_timestamp() then raise exception using errcode = '22023', message = 'program deadline must be in the future'; end if;
  if not exists (select 1 from private.funds f where f.tree_id = p_tree_id and f.id = p_fund_id) then raise exception using errcode = 'P0002', message = 'scholarship fund not found'; end if;

  delete from private.idempotency_records r where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'scholarship.program.create' and r.idempotency_key = p_idempotency_key and r.expires_at <= clock_timestamp();
  insert into private.idempotency_records(tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values(p_tree_id, v_actor, 'scholarship.program.create', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours')
  on conflict (tree_id, actor_id, operation, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'scholarship.program.create' and r.idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'version')::bigint, (v_existing.response->>'fundId')::uuid, v_existing.response->>'title', v_existing.response->>'criteria', (v_existing.response->>'closesAt')::timestamptz, v_existing.response->>'status';
    return;
  end if;

  insert into private.scholarship_programs(tree_id, created_by, fund_id, title, criteria, closes_at, status)
  values(p_tree_id, v_actor, p_fund_id, btrim(p_title), btrim(p_criteria), p_closes_at, p_status)
  returning * into v_program;
  insert into private.audit_events(tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary, metadata)
  values(p_tree_id, v_actor, 'scholarship.program.created', 'scholarship_program', v_program.id, gen_random_uuid(), 'Scholarship program created; criteria is public content', jsonb_build_object('status', v_program.status));
  insert into private.outbox(tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values(p_tree_id, 'scholarship.program.created', v_program.id, v_program.version, 'scholarship.program.created:' || v_program.id::text || ':' || v_program.version::text, v_actor);
  update private.idempotency_records r set response = jsonb_build_object('id', v_program.id, 'version', v_program.version, 'fundId', v_program.fund_id, 'title', v_program.title, 'criteria', v_program.criteria, 'closesAt', v_program.closes_at, 'status', v_program.status)
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'scholarship.program.create' and r.idempotency_key = p_idempotency_key;
  return query select v_program.id, v_program.version, v_program.fund_id, v_program.title, v_program.criteria, v_program.closes_at, v_program.status;
end;
$$;

create or replace function private.scholarship_application_create_idempotent(
  p_program_id uuid, p_person_id uuid, p_statement text, p_evidence_asset_id uuid,
  p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, version bigint, program_id uuid, person_id uuid, status text, statement text, evidence_asset_id uuid)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_program private.scholarship_programs%rowtype;
  v_existing private.idempotency_records%rowtype;
  v_application private.scholarship_applications%rowtype;
  v_inserted integer;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then raise exception using errcode = '22023', message = 'idempotency key and request hash are required'; end if;
  select * into v_program from private.scholarship_programs p where p.id = p_program_id for share;
  if not found then raise exception using errcode = 'P0002', message = 'scholarship program not found'; end if;
  if not private.is_active_member(v_program.tree_id) then raise exception using errcode = '42501', message = 'active tree membership required'; end if;
  if v_program.status <> 'open' or (v_program.closes_at is not null and v_program.closes_at <= clock_timestamp()) then raise exception using errcode = 'P0003', message = 'scholarship program is not accepting applications'; end if;
  if nullif(btrim(p_statement), '') is null or length(btrim(p_statement)) > 20000 then raise exception using errcode = '22023', message = 'application statement is required and must be <= 20000 characters'; end if;
  if not exists (select 1 from private.persons p where p.tree_id = v_program.tree_id and p.id = p_person_id) then raise exception using errcode = 'P0002', message = 'application person not found'; end if;
  if not exists (select 1 from private.media_assets m where m.tree_id = v_program.tree_id and m.id = p_evidence_asset_id and m.purpose = 'scholarship' and m.visibility = 'restricted' and m.state = 'ready') then raise exception using errcode = '42501', message = 'ready restricted scholarship evidence is required'; end if;

  delete from private.idempotency_records r where r.tree_id = v_program.tree_id and r.actor_id = v_actor and r.operation = 'scholarship.application.create' and r.idempotency_key = p_idempotency_key and r.expires_at <= clock_timestamp();
  insert into private.idempotency_records(tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values(v_program.tree_id, v_actor, 'scholarship.application.create', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours')
  on conflict (tree_id, actor_id, operation, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id = v_program.tree_id and r.actor_id = v_actor and r.operation = 'scholarship.application.create' and r.idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'version')::bigint, (v_existing.response->>'programId')::uuid, (v_existing.response->>'personId')::uuid, v_existing.response->>'status', v_existing.response->>'statement', (v_existing.response->>'evidenceAssetId')::uuid;
    return;
  end if;

  insert into private.scholarship_applications(tree_id, created_by, program_id, person_id, submitted_by, status, statement, evidence_asset_id)
  values(v_program.tree_id, v_actor, v_program.id, p_person_id, v_actor, 'submitted', btrim(p_statement), p_evidence_asset_id)
  returning * into v_application;
  insert into private.audit_events(tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary, metadata)
  values(v_program.tree_id, v_actor, 'scholarship.application.submitted', 'scholarship_application', v_application.id, gen_random_uuid(), 'Scholarship application submitted; statement and evidence are private', jsonb_build_object('programId', v_program.id, 'status', v_application.status));
  insert into private.outbox(tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values(v_program.tree_id, 'scholarship.application.submitted', v_application.id, v_application.version, 'scholarship.application.submitted:' || v_application.id::text || ':' || v_application.version::text, v_actor);
  update private.idempotency_records r set response = jsonb_build_object('id', v_application.id, 'version', v_application.version, 'programId', v_application.program_id, 'personId', v_application.person_id, 'status', v_application.status, 'statement', v_application.statement, 'evidenceAssetId', v_application.evidence_asset_id)
  where r.tree_id = v_program.tree_id and r.actor_id = v_actor and r.operation = 'scholarship.application.create' and r.idempotency_key = p_idempotency_key;
  return query select v_application.id, v_application.version, v_application.program_id, v_application.person_id, v_application.status, v_application.statement, v_application.evidence_asset_id;
exception when unique_violation then
  raise exception using errcode = 'P0003', message = 'this person already has an application for the program';
end;
$$;

create or replace function private.scholarship_application_list_authorized(p_program_id uuid)
returns table (id uuid, version bigint, program_id uuid, person_id uuid, status text, statement text, evidence_asset_id uuid)
language plpgsql stable security definer set search_path = pg_catalog, private
as $$
declare v_tree_id uuid; v_actor uuid := auth.uid();
begin
  select p.tree_id into v_tree_id from private.scholarship_programs p where p.id = p_program_id;
  if v_tree_id is null then raise exception using errcode = 'P0002', message = 'scholarship program not found'; end if;
  if v_actor is null or not private.is_active_member(v_tree_id) then raise exception using errcode = '42501', message = 'active tree membership required'; end if;
  if not private.has_capability(v_tree_id, 'scholarship.review', null) and not private.has_capability(v_tree_id, 'scholarship.manage', null) then
    return query select a.id, a.version, a.program_id, a.person_id, a.status, a.statement, a.evidence_asset_id from private.scholarship_applications a where a.tree_id = v_tree_id and a.program_id = p_program_id and a.submitted_by = v_actor order by a.created_at desc, a.id;
    return;
  end if;
  return query select a.id, a.version, a.program_id, a.person_id, a.status, a.statement, a.evidence_asset_id from private.scholarship_applications a where a.tree_id = v_tree_id and a.program_id = p_program_id order by a.created_at desc, a.id;
end;
$$;

create or replace function private.scholarship_application_review_idempotent(
  p_application_id uuid, p_decision text, p_reason text, p_base_version bigint,
  p_reviewed_snapshot_hash text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, version bigint, program_id uuid, person_id uuid, status text, statement text, evidence_asset_id uuid)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid(); v_application private.scholarship_applications%rowtype; v_existing private.idempotency_records%rowtype; v_updated private.scholarship_applications%rowtype; v_inserted integer; v_next_status text;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then raise exception using errcode = '22023', message = 'idempotency key and request hash are required'; end if;
  if p_decision not in ('approve', 'reject', 'needs_info') then raise exception using errcode = '22023', message = 'unsupported scholarship decision'; end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 4000 then raise exception using errcode = '22023', message = 'review reason is required and must be <= 4000 characters'; end if;
  if nullif(btrim(p_reviewed_snapshot_hash), '') is null or length(p_reviewed_snapshot_hash) > 255 then raise exception using errcode = '22023', message = 'reviewed snapshot hash is required'; end if;
  select * into v_application from private.scholarship_applications a where a.id = p_application_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'scholarship application not found'; end if;
  if not private.has_capability(v_application.tree_id, 'scholarship.review', null) and not private.has_capability(v_application.tree_id, 'scholarship.manage', null) then raise exception using errcode = '42501', message = 'scholarship review capability required'; end if;
  if not private.has_mfa() then raise exception using errcode = '42501', message = 'scholarship review requires aal2'; end if;
  delete from private.idempotency_records r where r.tree_id = v_application.tree_id and r.actor_id = v_actor and r.operation = 'scholarship.application.review' and r.idempotency_key = p_idempotency_key and r.expires_at <= clock_timestamp();
  insert into private.idempotency_records(tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values(v_application.tree_id, v_actor, 'scholarship.application.review', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours')
  on conflict (tree_id, actor_id, operation, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id = v_application.tree_id and r.actor_id = v_actor and r.operation = 'scholarship.application.review' and r.idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'version')::bigint, (v_existing.response->>'programId')::uuid, (v_existing.response->>'personId')::uuid, v_existing.response->>'status', v_existing.response->>'statement', (v_existing.response->>'evidenceAssetId')::uuid;
    return;
  end if;

  if v_application.submitted_by = v_actor then raise exception using errcode = '42501', message = 'submitter cannot review own application'; end if;
  if v_application.status not in ('submitted', 'needs_info') then raise exception using errcode = 'P0003', message = 'application is not reviewable in its current status'; end if;
  if p_base_version <> v_application.version then raise exception using errcode = 'P0009', message = 'application version is stale'; end if;
  v_next_status := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'needs_info' end;

  update private.scholarship_applications a set status = v_next_status, updated_at = clock_timestamp() where a.id = v_application.id and a.version = p_base_version returning * into v_updated;
  if not found then raise exception using errcode = 'P0009', message = 'application version is stale'; end if;
  insert into private.audit_events(tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary, metadata)
  values(v_updated.tree_id, v_actor, 'scholarship.application.reviewed', 'scholarship_application', v_updated.id, gen_random_uuid(), 'Scholarship application reviewed; decision and reason are retained in audit metadata', jsonb_build_object('decision', p_decision, 'nextStatus', v_next_status, 'reviewedSnapshotHash', p_reviewed_snapshot_hash));
  insert into private.outbox(tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values(v_updated.tree_id, 'scholarship.application.reviewed', v_updated.id, v_updated.version, 'scholarship.application.reviewed:' || v_updated.id::text || ':' || v_updated.version::text, v_actor);
  update private.idempotency_records r set response = jsonb_build_object('id', v_updated.id, 'version', v_updated.version, 'programId', v_updated.program_id, 'personId', v_updated.person_id, 'status', v_updated.status, 'statement', v_updated.statement, 'evidenceAssetId', v_updated.evidence_asset_id)
  where r.tree_id = v_updated.tree_id and r.actor_id = v_actor and r.operation = 'scholarship.application.review' and r.idempotency_key = p_idempotency_key;
  return query select v_updated.id, v_updated.version, v_updated.program_id, v_updated.person_id, v_updated.status, v_updated.statement, v_updated.evidence_asset_id;
end;
$$;

create or replace function api.scholarship_program_list(p_tree_id uuid)
returns table (id uuid, version bigint, fund_id uuid, title text, criteria text, closes_at timestamptz, status text)
language sql stable security invoker set search_path = pg_catalog, private as $$ select * from private.scholarship_program_list_authorized(p_tree_id); $$;
create or replace function api.scholarship_program_create(p_tree_id uuid, p_fund_id uuid, p_title text, p_criteria text, p_closes_at timestamptz, p_status text, p_idempotency_key uuid, p_request_hash text)
returns table (id uuid, version bigint, fund_id uuid, title text, criteria text, closes_at timestamptz, status text)
language sql security invoker set search_path = pg_catalog, private as $$ select * from private.scholarship_program_create_idempotent(p_tree_id,p_fund_id,p_title,p_criteria,p_closes_at,p_status,p_idempotency_key,p_request_hash); $$;
create or replace function api.scholarship_application_create(p_program_id uuid, p_person_id uuid, p_statement text, p_evidence_asset_id uuid, p_idempotency_key uuid, p_request_hash text)
returns table (id uuid, version bigint, program_id uuid, person_id uuid, status text, statement text, evidence_asset_id uuid)
language sql security invoker set search_path = pg_catalog, private as $$ select * from private.scholarship_application_create_idempotent(p_program_id,p_person_id,p_statement,p_evidence_asset_id,p_idempotency_key,p_request_hash); $$;
create or replace function api.scholarship_application_list(p_program_id uuid)
returns table (id uuid, version bigint, program_id uuid, person_id uuid, status text, statement text, evidence_asset_id uuid)
language sql stable security invoker set search_path = pg_catalog, private as $$ select * from private.scholarship_application_list_authorized(p_program_id); $$;
create or replace function api.scholarship_application_review(p_application_id uuid, p_decision text, p_reason text, p_base_version bigint, p_reviewed_snapshot_hash text, p_idempotency_key uuid, p_request_hash text)
returns table (id uuid, version bigint, program_id uuid, person_id uuid, status text, statement text, evidence_asset_id uuid)
language sql security invoker set search_path = pg_catalog, private as $$ select * from private.scholarship_application_review_idempotent(p_application_id,p_decision,p_reason,p_base_version,p_reviewed_snapshot_hash,p_idempotency_key,p_request_hash); $$;

revoke all on table private.scholarship_programs, private.scholarship_applications from public, anon, authenticated;
revoke all on function private.scholarship_program_list_authorized(uuid), private.scholarship_program_create_idempotent(uuid,uuid,text,text,timestamptz,text,uuid,text), private.scholarship_application_create_idempotent(uuid,uuid,text,uuid,uuid,text), private.scholarship_application_list_authorized(uuid), private.scholarship_application_review_idempotent(uuid,text,text,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function private.scholarship_program_list_authorized(uuid), private.scholarship_program_create_idempotent(uuid,uuid,text,text,timestamptz,text,uuid,text), private.scholarship_application_create_idempotent(uuid,uuid,text,uuid,uuid,text), private.scholarship_application_list_authorized(uuid), private.scholarship_application_review_idempotent(uuid,text,text,bigint,text,uuid,text) to authenticated;
grant execute on function api.scholarship_program_list(uuid), api.scholarship_program_create(uuid,uuid,text,text,timestamptz,text,uuid,text), api.scholarship_application_create(uuid,uuid,text,uuid,uuid,text), api.scholarship_application_list(uuid), api.scholarship_application_review(uuid,text,text,bigint,text,uuid,text) to authenticated;

commit;