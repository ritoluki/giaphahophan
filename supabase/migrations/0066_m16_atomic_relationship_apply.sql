-- M16-04: persist reviewed people and explicit family relationships atomically.
begin;

create or replace function private.import_apply(p_job_id uuid,p_expected_version bigint,p_approval_hash text,p_idempotency_key uuid,p_request_hash text)
returns table(job_id uuid,version bigint,status text,applied_people bigint,source_id uuid)
language plpgsql security definer set search_path=pg_catalog,private,extensions
as $$
declare
  v_actor uuid:=auth.uid();
  v_job private.import_jobs%rowtype;
  v_row private.import_rows%rowtype;
  v_mapping record;
  v_edge record;
  v_existing private.idempotency_records%rowtype;
  v_source uuid:=gen_random_uuid();
  v_person uuid;
  v_union uuid;
  v_parent uuid;
  v_child uuid;
  v_link uuid;
  v_count bigint:=0;
  v_union_count bigint:=0;
  v_link_count bigint:=0;
  v_gender text;
  v_record_type text;
  v_fact uuid;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_expected_version is null or p_expected_version<1 or p_approval_hash is null or p_approval_hash !~ '^[a-f0-9]{64}$'
     or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='valid apply version, approval and idempotency required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then raise exception using errcode='42501',message='import apply unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if not private.has_mfa() then raise exception using errcode='42501',message='MFA required for import apply'; end if;
  if v_job.status='completed' then
    select * into v_existing from private.idempotency_records r where r.tree_id=v_job.tree_id and r.actor_id=v_actor
      and r.operation='import.apply' and r.idempotency_key=p_idempotency_key and r.expires_at>clock_timestamp() for update;
    if not found or v_existing.request_hash is distinct from p_request_hash
       or v_existing.response->>'jobId' is distinct from v_job.id::text
       or v_existing.response->>'version' is distinct from v_job.version::text
       or v_existing.response->>'status' is distinct from 'completed'
       or v_job.approval_hash is distinct from p_approval_hash
       or v_job.manifest->>'appliedBaseVersion' is distinct from p_expected_version::text then
      raise exception using errcode='P0008',message='completed import replay does not match the original request';
    end if;
    return query select v_job.id,v_job.version,v_job.status,
      (v_existing.response->>'appliedPeople')::bigint,(v_existing.response->>'sourceId')::uuid;
    return;
  end if;
  if v_job.version<>p_expected_version then raise exception using errcode='40001',message='import job version changed'; end if;
  if v_job.status<>'ready' then raise exception using errcode='40001',message='import is not approved for apply'; end if;
  if v_job.approval_hash is distinct from p_approval_hash then raise exception using errcode='40001',message='import approval token is invalid'; end if;
  if v_job.manifest->>'reviewerId' is null or (v_job.manifest->>'reviewerId')::uuid=v_actor then
    raise exception using errcode='40001',message='independent reviewer is required'; end if;
  if v_job.manifest->>'reviewedSnapshotHash' is distinct from v_job.manifest->>'previewHash'
     or private.import_current_snapshot(v_job.id) is distinct from v_job.manifest->>'reviewedSnapshotHash' then
    raise exception using errcode='40001',message='reviewed staging rows changed'; end if;
  perform 1 from private.media_assets m where m.id=v_job.source_asset_id and m.tree_id=v_job.tree_id
     and m.purpose='import' and m.state='ready' and m.actual_sha256=v_job.file_sha256 and m.expected_sha256=v_job.file_sha256 for share;
  if not found then raise exception using errcode='40001',message='approved import source is no longer ready'; end if;
  if (v_job.manifest->>'reviewedVersion')::bigint<>v_job.version-1 then
    raise exception using errcode='40001',message='reviewed job version changed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_job.tree_id::text||':'||v_actor::text||':import.apply:'||p_idempotency_key::text,0));
  select * into v_existing from private.idempotency_records where tree_id=v_job.tree_id and actor_id=v_actor
    and operation='import.apply' and idempotency_key=p_idempotency_key and expires_at>clock_timestamp() for update;
  if found then
    if v_existing.request_hash<>p_request_hash then raise exception using errcode='P0008',message='idempotency key request mismatch'; end if;
    return query select (v_existing.response->>'jobId')::uuid,(v_existing.response->>'version')::bigint,
      v_existing.response->>'status',(v_existing.response->>'appliedPeople')::bigint,(v_existing.response->>'sourceId')::uuid;
    return;
  end if;
  if v_job.status<>'ready' or v_job.version<>p_expected_version then raise exception using errcode='40001',message='import job changed'; end if;
  -- The graph helper takes the same tree-scoped transaction lock as canonical
  -- parent-link mutations; it remains held until this transaction commits.
  if not private.import_relationship_batch_complete(v_job.id)
     or not private.import_relationship_graph_is_safe(v_job.id) then
    raise exception using errcode='22023',message='relationship coverage changed or graph is unsafe';
  end if;
  update private.import_jobs set status='applying',version=private.import_jobs.version+1 where id=v_job.id returning * into v_job;
  insert into private.sources(id,tree_id,created_by,title,kind,provenance,visibility,rights_note,provider_name,original_asset_id)
    values(v_source,v_job.tree_id,v_actor,'Nguồn nhập demo · '||left(v_job.file_sha256,12),'document',
      'Nhập từ batch '||v_job.id||'; SHA-256 '||v_job.file_sha256,'restricted','Synthetic demo import; original retained in private storage',v_job.source_namespace,v_job.source_asset_id);

  for v_row in select r.* from private.import_rows r where r.job_id=v_job.id
      and not exists(select 1 from private.import_row_decisions d where d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number and d.excluded)
      order by r.row_number for update loop
    v_record_type:=coalesce(v_row.normalized->>'recordType','INDI');
    if v_record_type='FAM' then continue; end if;
    if v_row.status not in ('valid','review')
       or (v_row.status='review' and v_row.errors is distinct from '["relationship_mapping_requires_review"]'::jsonb)
       or (v_row.status='valid' and jsonb_array_length(v_row.errors)>0)
       or v_record_type not in ('INDI','PERSON') then
      raise exception using errcode='22023',message='unsupported or unreviewed import row'; end if;
    if not private.import_date_valid(v_row.normalized->'birthDate') or not private.import_date_valid(v_row.normalized->'deathDate') then
      raise exception using errcode='22023',message='invalid normalized genealogy date'; end if;
    if jsonb_typeof(v_row.normalized->'displayName') is distinct from 'string'
       or length(btrim(v_row.normalized->>'displayName')) not between 1 and 300
       or v_row.external_id is null or v_row.normalized->>'externalId' is distinct from v_row.external_id then
      raise exception using errcode='22023',message='invalid normalized person identity'; end if;
    select canonical_id into v_person from private.external_id_map where tree_id=v_job.tree_id
      and source_namespace=v_job.source_namespace and external_id=v_row.external_id and entity_kind='person' for update;
    if v_person is null then raise exception using errcode='23503',message='stable person identity mapping missing'; end if;
    if exists(select 1 from private.persons where tree_id=v_job.tree_id and id=v_person) then
      raise exception using errcode='23505',message='mapped canonical person already exists; merge/update requires separate review'; end if;
    v_gender:=case upper(coalesce(v_row.normalized->>'gender',v_row.normalized->>'sex','')) when 'M' then 'M' when 'F' then 'F' when 'X' then 'X' when 'U' then 'U' else null end;
    insert into private.persons(id,tree_id,created_by,code,display_name,name_search,recorded_sex,life_status,visibility,biography,confidence)
      values(v_person,v_job.tree_id,v_actor,'IMP-'||upper(substr(replace(v_person::text,'-',''),1,12)),
        left(btrim(v_row.normalized->>'displayName'),300),private.normalize_name_search(left(btrim(v_row.normalized->>'displayName'),300)),
        v_gender,'unknown','restricted',null,'unverified');
    insert into private.person_names(tree_id,created_by,person_id,name,name_search,kind,is_preferred)
      values(v_job.tree_id,v_actor,v_person,left(btrim(v_row.normalized->>'displayName'),300),
        private.normalize_name_search(left(btrim(v_row.normalized->>'displayName'),300)),'birth',true);
    if jsonb_typeof(v_row.normalized->'birthDate')='object' then
      insert into private.person_facts(tree_id,created_by,person_id,kind,value_date,confidence,visibility)
        values(v_job.tree_id,v_actor,v_person,'birth',v_row.normalized->'birthDate','unverified','restricted') returning id into v_fact;
      insert into private.citations(tree_id,created_by,source_id,fact_id,locator,confidence)
        values(v_job.tree_id,v_actor,v_source,v_fact,'Dòng nguồn '||v_row.row_number||' · ngày sinh','unverified');
    end if;
    if jsonb_typeof(v_row.normalized->'deathDate')='object' then
      insert into private.person_facts(tree_id,created_by,person_id,kind,value_date,confidence,visibility)
        values(v_job.tree_id,v_actor,v_person,'death',v_row.normalized->'deathDate','unverified','restricted') returning id into v_fact;
      insert into private.citations(tree_id,created_by,source_id,fact_id,locator,confidence)
        values(v_job.tree_id,v_actor,v_source,v_fact,'Dòng nguồn '||v_row.row_number||' · ngày mất','unverified');
    end if;
    insert into private.citations(tree_id,created_by,source_id,person_id,locator,confidence)
      values(v_job.tree_id,v_actor,v_source,v_person,'Dòng nguồn '||v_row.row_number,'unverified');
    v_count:=v_count+1;
  end loop;

  for v_mapping in
    select m.family_row_number,m.mapping,f.external_id,f.normalized
    from private.import_relationship_mappings m
    join private.import_rows f on f.tree_id=m.tree_id and f.job_id=m.job_id and f.row_number=m.family_row_number
    where m.tree_id=v_job.tree_id and m.job_id=v_job.id
      and not exists(select 1 from private.import_row_decisions d where d.tree_id=f.tree_id and d.job_id=f.job_id and d.row_number=f.row_number and d.excluded)
    order by m.family_row_number
  loop
    select canonical_id into v_union from private.external_id_map where tree_id=v_job.tree_id
      and source_namespace=v_job.source_namespace and external_id=v_mapping.external_id and entity_kind='family' for update;
    if v_union is null then raise exception using errcode='23503',message='stable family identity mapping missing'; end if;
    insert into private.unions(id,tree_id,created_by,kind,status) values(v_union,v_job.tree_id,v_actor,'unknown','unknown');
    v_union_count:=v_union_count+1;
    insert into private.union_partners(tree_id,union_id,person_id,ordinal)
      select v_job.tree_id,v_union,pmap.canonical_id,participant.ordinality::integer
      from jsonb_array_elements_text(v_mapping.mapping->'partnerExternalIds') with ordinality participant(external_id,ordinality)
      join private.external_id_map pmap on pmap.tree_id=v_job.tree_id and pmap.source_namespace=v_job.source_namespace
        and pmap.external_id=participant.external_id and pmap.entity_kind='person';
    insert into private.union_children(tree_id,union_id,person_id,ordinal)
      select v_job.tree_id,v_union,cmap.canonical_id,participant.ordinality::integer
      from jsonb_array_elements_text(v_mapping.mapping->'childExternalIds') with ordinality participant(external_id,ordinality)
      join private.external_id_map cmap on cmap.tree_id=v_job.tree_id and cmap.source_namespace=v_job.source_namespace
        and cmap.external_id=participant.external_id and cmap.entity_kind='person';
    insert into private.citations(tree_id,created_by,source_id,union_id,locator,confidence)
      values(v_job.tree_id,v_actor,v_source,v_union,'Dòng gia đình '||v_mapping.external_id,'unverified');

    for v_edge in select edge.value,edge.ordinality from jsonb_array_elements(v_mapping.mapping->'parentLinks')
      with ordinality edge(value,ordinality) order by edge.ordinality loop
      select canonical_id into v_parent from private.external_id_map where tree_id=v_job.tree_id
        and source_namespace=v_job.source_namespace and external_id=v_edge.value->>'parentExternalId' and entity_kind='person';
      select canonical_id into v_child from private.external_id_map where tree_id=v_job.tree_id
        and source_namespace=v_job.source_namespace and external_id=v_edge.value->>'childExternalId' and entity_kind='person';
      if v_parent is null or v_child is null then raise exception using errcode='23503',message='stable parent or child identity mapping missing'; end if;
      insert into private.parent_links(tree_id,created_by,parent_id,child_id,kind,status,ordinal,source_id)
        values(v_job.tree_id,v_actor,v_parent,v_child,v_edge.value->>'kind',v_edge.value->>'status',v_edge.ordinality::integer,v_source)
        returning id into v_link;
      insert into private.citations(tree_id,created_by,source_id,parent_link_id,locator,confidence)
        values(v_job.tree_id,v_actor,v_source,v_link,'Dòng gia đình '||v_mapping.external_id||' · quan hệ '||v_edge.ordinality,'unverified');
      v_link_count:=v_link_count+1;
    end loop;
  end loop;

  if v_union_count>0 or v_link_count>0 then
    update private.trees set graph_revision=graph_revision+1 where id=v_job.tree_id;
  end if;
  update private.import_jobs set status='completed',version=private.import_jobs.version+1,
    counters=jsonb_build_object('processed',v_count+coalesce((v_job.manifest->>'excluded')::bigint,0),'succeeded',v_count,'failed',0,'skipped',coalesce((v_job.manifest->>'excluded')::bigint,0)),
    manifest=manifest||jsonb_build_object('appliedPeople',v_count,'appliedUnions',v_union_count,'appliedParentLinks',v_link_count,
      'sourceId',v_source,'appliedBy',v_actor,'appliedBaseVersion',p_expected_version,'completedAt',clock_timestamp(),
      'appliedEntities',(select jsonb_agg(jsonb_build_object('rowNumber',r.row_number,'personId',m.canonical_id,'baseVersion',1) order by r.row_number)
        from private.import_rows r join private.external_id_map m on m.tree_id=r.tree_id and m.external_id=r.external_id
          and m.source_namespace=v_job.source_namespace and m.entity_kind='person'
        where r.job_id=v_job.id and not exists(select 1 from private.import_row_decisions d where d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number and d.excluded)))
    where id=v_job.id returning * into v_job;
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(v_job.tree_id,v_actor,'import.apply',p_idempotency_key,p_request_hash,
      jsonb_build_object('jobId',v_job.id,'version',v_job.version,'status',v_job.status,'appliedPeople',v_count,
        'appliedUnions',v_union_count,'appliedParentLinks',v_link_count,'sourceId',v_source),clock_timestamp()+interval '24 hours');
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.applied','import',v_job.id,gen_random_uuid(),'Approved synthetic demo people and explicit relationship citations applied atomically');
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by)
    values(v_job.tree_id,'import.completed',v_job.id,v_job.version,'import.completed:'||v_job.id,v_actor) on conflict(dedupe_key) do nothing;
  return query select v_job.id,v_job.version,v_job.status,v_count,v_source;
end;
$$;

revoke all on function private.import_apply(uuid,bigint,text,uuid,text) from public,anon,authenticated;

create or replace function private.import_job_state(p_job_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare v_job private.import_jobs%rowtype; v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then
    raise exception using errcode='42501',message='import job unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  return jsonb_build_object('job',jsonb_build_object('id',v_job.id,'version',v_job.version,'kind','import',
    'status',v_job.status,'counters',v_job.counters,'warnings',coalesce(v_job.manifest->'warnings','[]'::jsonb),
    'errorCode',null,'expiresAt',null,'treeId',v_job.tree_id,'sourceAssetId',v_job.source_asset_id,
    'fileSha256',v_job.file_sha256,'format',v_job.format,'sourceNamespace',v_job.source_namespace,
    'mappingVersion',v_job.mapping_version,'classification',v_job.classification),
    'approvalId',v_job.approval_id,'approvedSnapshotHash',v_job.manifest->>'reviewedSnapshotHash',
    'canReview',v_job.status='needs_review' and v_actor<>v_job.created_by and private.has_mfa(),
    'canApply',v_job.status='ready' and v_actor::text is distinct from v_job.manifest->>'reviewerId' and private.has_mfa(),
    'appliedPeople',coalesce((v_job.manifest->>'appliedPeople')::bigint,0),
    'appliedUnions',coalesce((v_job.manifest->>'appliedUnions')::bigint,0),
    'appliedParentLinks',coalesce((v_job.manifest->>'appliedParentLinks')::bigint,0));
end;
$$;

create or replace function api.import_job_state(p_job_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.import_job_state($1); $$;
revoke all on function private.import_job_state(uuid),api.import_job_state(uuid) from public,anon,authenticated;
grant execute on function private.import_job_state(uuid),api.import_job_state(uuid) to authenticated;

commit;
