-- M14-02 two-person journal submit/approve workflow with MFA and idempotency.
begin;

drop function if exists api.journal_entry_submit_idempotent(uuid,bigint,text,uuid,text);
drop function if exists api.journal_entry_approve_idempotent(uuid,bigint,text,uuid,text);
drop function if exists private.journal_entry_submit_idempotent(uuid,bigint,text,uuid,text);
drop function if exists private.journal_entry_approve_idempotent(uuid,bigint,text,uuid,text);
drop function if exists private.journal_entry_result(uuid,uuid);

create or replace function private.journal_entry_result(p_tree_id uuid, p_entry_id uuid)
returns table (
  id uuid,
  version bigint,
  code text,
  status text,
  fund_id uuid,
  entry_date date,
  description text,
  proof_asset_id uuid,
  donor_person_id uuid,
  lines jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select e.id, e.version, e.code, e.status, e.fund_id, e.entry_date, e.description,
    e.proof_asset_id, e.donor_person_id,
    coalesce(jsonb_agg(jsonb_build_object('accountId', l.account_id, 'signedAmountVnd', l.signed_amount_vnd::text) order by l.id) filter (where l.id is not null), '[]'::jsonb)
  from private.journal_entries e
  left join private.journal_lines l on l.tree_id = e.tree_id and l.entry_id = e.id
  where e.tree_id = p_tree_id and e.id = p_entry_id
  group by e.id, e.version, e.code, e.status, e.fund_id, e.entry_date, e.description, e.proof_asset_id, e.donor_person_id;
$$;

create or replace function private.journal_entry_submit_idempotent(
  p_entry_id uuid,
  p_base_version bigint,
  p_reason text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  id uuid,
  version bigint,
  code text,
  status text,
  fund_id uuid,
  entry_date date,
  description text,
  proof_asset_id uuid,
  donor_person_id uuid,
  lines jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_entry private.journal_entries%rowtype;
  v_existing private.idempotency_records%rowtype;
  v_result record;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then raise exception using errcode = '22023', message = 'idempotency key and request hash are required'; end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 2000 then raise exception using errcode = '22023', message = 'reason is required'; end if;

  select * into v_entry from private.journal_entries e where e.id = p_entry_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'journal entry not found'; end if;
  if not private.has_capability(v_entry.tree_id, 'treasury.write', null) then raise exception using errcode = '42501', message = 'treasury write capability required'; end if;
  if v_entry.submitted_by <> v_actor then raise exception using errcode = '42501', message = 'only journal author can submit'; end if;

  select * into v_existing from private.idempotency_records r
  where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.submit'
    and r.idempotency_key = p_idempotency_key and r.expires_at > clock_timestamp() for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'version')::bigint, v_existing.response->>'code', v_existing.response->>'status', (v_existing.response->>'fundId')::uuid, (v_existing.response->>'entryDate')::date, v_existing.response->>'description', nullif(v_existing.response->>'proofAssetId','')::uuid, nullif(v_existing.response->>'donorPersonId','')::uuid, v_existing.response->'lines';
    return;
  end if;
  delete from private.idempotency_records r where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.submit' and r.idempotency_key = p_idempotency_key;
  begin
    insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
    values (v_entry.tree_id, v_actor, 'journal.submit', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours');
  exception when unique_violation then
    select * into v_existing from private.idempotency_records r where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.submit' and r.idempotency_key = p_idempotency_key for update;
    if v_existing.request_hash <> p_request_hash or v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request conflict'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'version')::bigint, v_existing.response->>'code', v_existing.response->>'status', (v_existing.response->>'fundId')::uuid, (v_existing.response->>'entryDate')::date, v_existing.response->>'description', nullif(v_existing.response->>'proofAssetId','')::uuid, nullif(v_existing.response->>'donorPersonId','')::uuid, v_existing.response->'lines';
    return;
  end;

  if v_entry.status <> 'draft' then raise exception using errcode = 'P0001', message = 'journal entry is not draft'; end if;
  if v_entry.version <> p_base_version then raise exception using errcode = 'P0009', message = 'journal version conflict'; end if;
  update private.journal_entries e set status = 'submitted', version = e.version + 1 where e.tree_id = v_entry.tree_id and e.id = p_entry_id;
  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary)
  values (v_entry.tree_id, v_actor, 'journal.submitted', 'journal_entry', p_entry_id, gen_random_uuid(), 'Journal submitted for independent review');
  insert into private.outbox (tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values (v_entry.tree_id, 'journal.submitted', p_entry_id, v_entry.version + 1, 'journal.submitted:' || v_entry.id::text || ':' || (v_entry.version + 1)::text, v_actor);
  select * into v_result from private.journal_entry_result(v_entry.tree_id, p_entry_id);
  update private.idempotency_records r set response = jsonb_build_object('id', v_result.id, 'version', v_result.version, 'code', v_result.code, 'status', v_result.status, 'fundId', v_result.fund_id, 'entryDate', v_result.entry_date, 'description', v_result.description, 'proofAssetId', v_result.proof_asset_id, 'donorPersonId', v_result.donor_person_id, 'lines', v_result.lines) where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.submit' and r.idempotency_key = p_idempotency_key;
  return query select * from private.journal_entry_result(v_entry.tree_id, p_entry_id);
end;
$$;

create or replace function private.journal_entry_approve_idempotent(
  p_entry_id uuid,
  p_base_version bigint,
  p_reason text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  id uuid,
  version bigint,
  code text,
  status text,
  fund_id uuid,
  entry_date date,
  description text,
  proof_asset_id uuid,
  donor_person_id uuid,
  lines jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_entry private.journal_entries%rowtype;
  v_existing private.idempotency_records%rowtype;
  v_result record;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then raise exception using errcode = '22023', message = 'idempotency key and request hash are required'; end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 2000 then raise exception using errcode = '22023', message = 'reason is required'; end if;
  select * into v_entry from private.journal_entries e where e.id = p_entry_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'journal entry not found'; end if;
  if not private.has_capability(v_entry.tree_id, 'treasury.approve', null) or not private.has_mfa() then raise exception using errcode = '42501', message = 'treasury approval requires capability and MFA'; end if;
  if v_entry.submitted_by = v_actor then raise exception using errcode = '42501', message = 'journal author cannot approve own entry'; end if;

  select * into v_existing from private.idempotency_records r
  where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.approve'
    and r.idempotency_key = p_idempotency_key and r.expires_at > clock_timestamp() for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'version')::bigint, v_existing.response->>'code', v_existing.response->>'status', (v_existing.response->>'fundId')::uuid, (v_existing.response->>'entryDate')::date, v_existing.response->>'description', nullif(v_existing.response->>'proofAssetId','')::uuid, nullif(v_existing.response->>'donorPersonId','')::uuid, v_existing.response->'lines';
    return;
  end if;
  delete from private.idempotency_records r where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.approve' and r.idempotency_key = p_idempotency_key;
  begin
    insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
    values (v_entry.tree_id, v_actor, 'journal.approve', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours');
  exception when unique_violation then
    select * into v_existing from private.idempotency_records r where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.approve' and r.idempotency_key = p_idempotency_key for update;
    if v_existing.request_hash <> p_request_hash or v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request conflict'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'version')::bigint, v_existing.response->>'code', v_existing.response->>'status', (v_existing.response->>'fundId')::uuid, (v_existing.response->>'entryDate')::date, v_existing.response->>'description', nullif(v_existing.response->>'proofAssetId','')::uuid, nullif(v_existing.response->>'donorPersonId','')::uuid, v_existing.response->'lines';
    return;
  end;

  if v_entry.status <> 'submitted' then raise exception using errcode = 'P0001', message = 'journal entry is not submitted'; end if;
  if v_entry.version <> p_base_version then raise exception using errcode = 'P0009', message = 'journal version conflict'; end if;
  if exists (select 1 from private.funds f where f.tree_id = v_entry.tree_id and f.id = v_entry.fund_id and f.closed_through is not null and v_entry.entry_date <= f.closed_through) then raise exception using errcode = 'P0001', message = 'journal period is closed'; end if;
  update private.journal_entries e set status = 'posted', approved_by = v_actor, posted_at = clock_timestamp(), version = e.version + 1 where e.tree_id = v_entry.tree_id and e.id = p_entry_id;
  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary)
  values (v_entry.tree_id, v_actor, 'journal.posted', 'journal_entry', p_entry_id, gen_random_uuid(), 'Journal approved by an independent MFA reviewer');
  insert into private.outbox (tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values (v_entry.tree_id, 'journal.posted', p_entry_id, v_entry.version + 1, 'journal.posted:' || v_entry.id::text || ':' || (v_entry.version + 1)::text, v_actor);
  select * into v_result from private.journal_entry_result(v_entry.tree_id, p_entry_id);
  update private.idempotency_records r set response = jsonb_build_object('id', v_result.id, 'version', v_result.version, 'code', v_result.code, 'status', v_result.status, 'fundId', v_result.fund_id, 'entryDate', v_result.entry_date, 'description', v_result.description, 'proofAssetId', v_result.proof_asset_id, 'donorPersonId', v_result.donor_person_id, 'lines', v_result.lines) where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.approve' and r.idempotency_key = p_idempotency_key;
  return query select * from private.journal_entry_result(v_entry.tree_id, p_entry_id);
end;
$$;

create or replace function api.journal_entry_submit_idempotent(p_entry_id uuid, p_base_version bigint, p_reason text, p_idempotency_key uuid, p_request_hash text)
returns table (id uuid, version bigint, code text, status text, fund_id uuid, entry_date date, description text, proof_asset_id uuid, donor_person_id uuid, lines jsonb)
language sql security invoker set search_path = pg_catalog as $$ select * from private.journal_entry_submit_idempotent($1,$2,$3,$4,$5); $$;
create or replace function api.journal_entry_approve_idempotent(p_entry_id uuid, p_base_version bigint, p_reason text, p_idempotency_key uuid, p_request_hash text)
returns table (id uuid, version bigint, code text, status text, fund_id uuid, entry_date date, description text, proof_asset_id uuid, donor_person_id uuid, lines jsonb)
language sql security invoker set search_path = pg_catalog as $$ select * from private.journal_entry_approve_idempotent($1,$2,$3,$4,$5); $$;

revoke all on function private.journal_entry_result(uuid,uuid) from public, anon, authenticated;
revoke all on function private.journal_entry_submit_idempotent(uuid,bigint,text,uuid,text) from public, anon, authenticated;
revoke all on function private.journal_entry_approve_idempotent(uuid,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function private.journal_entry_submit_idempotent(uuid,bigint,text,uuid,text) to authenticated;
grant execute on function private.journal_entry_approve_idempotent(uuid,bigint,text,uuid,text) to authenticated;
revoke all on function api.journal_entry_submit_idempotent(uuid,bigint,text,uuid,text) from public, anon, authenticated;
revoke all on function api.journal_entry_approve_idempotent(uuid,bigint,text,uuid,text) from public, anon, authenticated;
grant usage on schema api to authenticated;
grant execute on function api.journal_entry_submit_idempotent(uuid,bigint,text,uuid,text) to authenticated;
grant execute on function api.journal_entry_approve_idempotent(uuid,bigint,text,uuid,text) to authenticated;

commit;