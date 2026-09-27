-- M14-03 immutable posted journals and linked two-person reversal creation.
begin;

create unique index if not exists journal_entries_one_reversal_idx
  on private.journal_entries (tree_id, fund_id, reverses_entry_id)
  where reverses_entry_id is not null;

create or replace function private.prevent_posted_journal_entry_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if old.status = 'posted' then
    raise exception using errcode = '42501', message = 'posted journal entries are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists journal_entry_posted_immutable on private.journal_entries;
create trigger journal_entry_posted_immutable
before update or delete on private.journal_entries
for each row execute function private.prevent_posted_journal_entry_mutation();

create or replace function private.prevent_posted_journal_line_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_status text;
  v_tree_id uuid;
  v_fund_id uuid;
  v_entry_id uuid;
begin
  if tg_op = 'INSERT' then
    v_tree_id := new.tree_id;
    v_fund_id := new.fund_id;
    v_entry_id := new.entry_id;
  else
    v_tree_id := old.tree_id;
    v_fund_id := old.fund_id;
    v_entry_id := old.entry_id;
  end if;

  select e.status into v_status
  from private.journal_entries e
  where e.tree_id = v_tree_id and e.fund_id = v_fund_id and e.id = v_entry_id;

  if v_status = 'posted' then
    raise exception using errcode = '42501', message = 'posted journal lines are immutable';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists journal_line_posted_immutable on private.journal_lines;
create trigger journal_line_posted_immutable
before insert or update or delete on private.journal_lines
for each row execute function private.prevent_posted_journal_line_mutation();

create or replace function private.journal_entry_reverse_idempotent(
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
  v_reversal_id uuid := gen_random_uuid();
  v_reversal_code text;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then raise exception using errcode = '22023', message = 'idempotency key and request hash are required'; end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 2000 then raise exception using errcode = '22023', message = 'reason is required'; end if;

  select * into v_entry
  from private.journal_entries e
  where e.id = p_entry_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'journal entry not found'; end if;
  if not private.has_capability(v_entry.tree_id, 'treasury.write', null) then raise exception using errcode = '42501', message = 'treasury write capability required'; end if;
  if v_entry.status <> 'posted' then raise exception using errcode = 'P0001', message = 'only posted journal entries can be reversed'; end if;
  if v_entry.version <> p_base_version then raise exception using errcode = 'P0009', message = 'journal version conflict'; end if;

  select * into v_existing
  from private.idempotency_records r
  where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.reverse'
    and r.idempotency_key = p_idempotency_key and r.expires_at > clock_timestamp()
  for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'version')::bigint, v_existing.response->>'code', v_existing.response->>'status', (v_existing.response->>'fundId')::uuid, (v_existing.response->>'entryDate')::date, v_existing.response->>'description', nullif(v_existing.response->>'proofAssetId','')::uuid, nullif(v_existing.response->>'donorPersonId','')::uuid, v_existing.response->'lines';
    return;
  end if;

  delete from private.idempotency_records r
  where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.reverse' and r.idempotency_key = p_idempotency_key;

  begin
    insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
    values (v_entry.tree_id, v_actor, 'journal.reverse', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours');
  exception when unique_violation then
    select * into v_existing
    from private.idempotency_records r
    where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.reverse' and r.idempotency_key = p_idempotency_key
    for update;
    if v_existing.request_hash <> p_request_hash or v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request conflict'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'version')::bigint, v_existing.response->>'code', v_existing.response->>'status', (v_existing.response->>'fundId')::uuid, (v_existing.response->>'entryDate')::date, v_existing.response->>'description', nullif(v_existing.response->>'proofAssetId','')::uuid, nullif(v_existing.response->>'donorPersonId','')::uuid, v_existing.response->'lines';
    return;
  end;

  if exists (
    select 1 from private.journal_entries e
    where e.tree_id = v_entry.tree_id and e.fund_id = v_entry.fund_id and e.reverses_entry_id = v_entry.id
  ) then
    raise exception using errcode = '23505', message = 'journal entry already has a reversal';
  end if;

  v_reversal_code := left('REV-' || v_entry.code || '-' || replace(v_reversal_id::text, '-', ''), 100);

  insert into private.journal_entries (
    id, tree_id, created_by, fund_id, code, entry_date, description, status,
    submitted_by, reverses_entry_id, proof_asset_id, donor_person_id
  ) values (
    v_reversal_id, v_entry.tree_id, v_actor, v_entry.fund_id, v_reversal_code, v_entry.entry_date,
    left('Reversal: ' || v_entry.description, 5000), 'draft',
    v_actor, v_entry.id, v_entry.proof_asset_id, v_entry.donor_person_id
  );

  insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
  select v_entry.tree_id, v_actor, v_entry.fund_id, v_reversal_id, l.account_id, -l.signed_amount_vnd
  from private.journal_lines l
  where l.tree_id = v_entry.tree_id and l.fund_id = v_entry.fund_id and l.entry_id = v_entry.id;

  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary, metadata)
  values (
    v_entry.tree_id, v_actor, 'journal.reversal_created', 'journal_entry', v_reversal_id, gen_random_uuid(),
    'Linked reversal draft created for posted journal',
    jsonb_build_object('reason', btrim(p_reason), 'reversesEntryId', v_entry.id)
  );
  insert into private.outbox (tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values (
    v_entry.tree_id, 'journal.reversal_created', v_reversal_id, 1,
    'journal.reversal_created:' || v_entry.id::text, v_actor
  );

  select * into v_result from private.journal_entry_result(v_entry.tree_id, v_reversal_id);
  update private.idempotency_records r
  set response = jsonb_build_object(
    'id', v_result.id, 'version', v_result.version, 'code', v_result.code, 'status', v_result.status,
    'fundId', v_result.fund_id, 'entryDate', v_result.entry_date, 'description', v_result.description,
    'proofAssetId', v_result.proof_asset_id, 'donorPersonId', v_result.donor_person_id, 'lines', v_result.lines
  )
  where r.tree_id = v_entry.tree_id and r.actor_id = v_actor and r.operation = 'journal.reverse' and r.idempotency_key = p_idempotency_key;

  return query select * from private.journal_entry_result(v_entry.tree_id, v_reversal_id);
end;
$$;

create or replace function api.journal_entry_reverse_idempotent(
  p_entry_id uuid,
  p_base_version bigint,
  p_reason text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (id uuid, version bigint, code text, status text, fund_id uuid, entry_date date, description text, proof_asset_id uuid, donor_person_id uuid, lines jsonb)
language sql security invoker
set search_path = pg_catalog
as $$
  select * from private.journal_entry_reverse_idempotent($1, $2, $3, $4, $5);
$$;

revoke all on function private.prevent_posted_journal_entry_mutation() from public, anon, authenticated;
revoke all on function private.prevent_posted_journal_line_mutation() from public, anon, authenticated;
revoke all on function private.journal_entry_reverse_idempotent(uuid,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function private.journal_entry_reverse_idempotent(uuid,bigint,text,uuid,text) to authenticated;
revoke all on function api.journal_entry_reverse_idempotent(uuid,bigint,text,uuid,text) from public, anon, authenticated;
grant usage on schema api to authenticated;
grant execute on function api.journal_entry_reverse_idempotent(uuid,bigint,text,uuid,text) to authenticated;

commit;