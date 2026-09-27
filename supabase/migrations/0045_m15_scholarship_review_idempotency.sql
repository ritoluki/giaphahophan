begin;
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


grant execute on function private.scholarship_application_review_idempotent(uuid,text,text,bigint,text,uuid,text) to authenticated;
commit;
