-- M16-04: independent review may approve only a completely mapped, safe batch.
-- Canonical relationship persistence remains disabled until atomic apply lands.
begin;

create or replace function private.import_review(p_job_id uuid,p_expected_version bigint,p_snapshot_hash text)
returns table(job_id uuid,version bigint,status text,approval_hash text)
language plpgsql security definer set search_path=pg_catalog,private,extensions
as $$
declare
  v_actor uuid:=auth.uid();
  v_job private.import_jobs%rowtype;
  v_hash text;
  v_included_people bigint;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_expected_version is null or p_expected_version<1 or p_snapshot_hash is null or p_snapshot_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='valid review version and snapshot required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then raise exception using errcode='42501',message='import review unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if not private.has_mfa() then raise exception using errcode='42501',message='MFA required for import review'; end if;
  if v_actor=v_job.created_by then raise exception using errcode='42501',message='import creator cannot review own batch'; end if;
  if v_job.version<>p_expected_version or v_job.status<>'needs_review'
     or v_job.manifest->>'previewHash' is distinct from p_snapshot_hash
     or private.import_current_snapshot(v_job.id) is distinct from p_snapshot_hash then
    raise exception using errcode='40001',message='import preview changed; reload before review';
  end if;

  select count(*) filter(where coalesce(r.normalized->>'recordType','INDI') in ('INDI','PERSON'))
    into v_included_people
  from private.import_rows r
  left join private.import_row_decisions d on d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number
  where r.tree_id=v_job.tree_id and r.job_id=v_job.id and not coalesce(d.excluded,false);

  if v_included_people<1 or v_included_people>2000
     or exists(
       select 1 from private.import_rows r
       left join private.import_row_decisions d on d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number
       where r.tree_id=v_job.tree_id and r.job_id=v_job.id and not coalesce(d.excluded,false)
         and (r.status not in ('valid','review')
           or (r.status='review' and r.errors is distinct from '["relationship_mapping_requires_review"]'::jsonb)
           or (r.status='valid' and jsonb_array_length(r.errors)>0)
           or coalesce(r.normalized->>'recordType','INDI') not in ('INDI','PERSON','FAM'))
     )
     or not private.import_relationship_batch_complete(v_job.id)
     or not private.import_relationship_graph_is_safe(v_job.id) then
    raise exception using errcode='22023',message='batch is incomplete, unsupported, or has an unsafe relationship graph';
  end if;

  v_hash:=encode(extensions.digest(concat_ws(':',v_job.id,v_job.version,v_job.file_sha256,p_snapshot_hash,v_actor),'sha256'),'hex');
  update private.import_jobs set status='ready',version=private.import_jobs.version+1,approval_hash=v_hash,approval_id=gen_random_uuid(),
    manifest=manifest||jsonb_build_object('reviewerId',v_actor,'reviewedVersion',v_job.version,'reviewedSnapshotHash',p_snapshot_hash)
    where id=v_job.id returning * into v_job;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.reviewed','import',v_job.id,gen_random_uuid(),'Synthetic demo import approved after independent MFA review and complete relationship graph validation');
  return query select v_job.id,v_job.version,v_job.status,v_job.approval_hash;
end;
$$;

revoke all on function private.import_review(uuid,bigint,text) from public,anon,authenticated;

commit;
