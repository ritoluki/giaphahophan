-- M16-05: bounded, snapshot-bound chunk transactions. Synthetic demo trees only.
begin;

create table private.import_chunks (
  tree_id uuid not null,
  job_id uuid not null,
  approval_id uuid not null,
  sequence integer not null check (sequence>0),
  phase text not null check (phase in ('people','families')),
  row_numbers integer[] not null check (cardinality(row_numbers) between 1 and 500),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  chunk_hash text not null check (chunk_hash ~ '^[a-f0-9]{64}$'),
  approved_version bigint not null check (approved_version>0),
  status text not null default 'pending' check (status in ('pending','completed')),
  actor_id uuid references auth.users(id),
  base_version bigint,
  idempotency_key uuid,
  request_hash text,
  result jsonb,
  response jsonb,
  committed_at timestamptz,
  primary key(job_id,approval_id,sequence),
  unique(tree_id,actor_id,idempotency_key),
  foreign key(tree_id,job_id) references private.import_jobs(tree_id,id) on delete cascade,
  check ((status='pending' and committed_at is null and result is null and response is null)
    or (status='completed' and committed_at is not null and result is not null and response is not null
      and actor_id is not null and base_version is not null and idempotency_key is not null and request_hash is not null))
);
create table private.import_owned_rows (
  tree_id uuid not null,
  job_id uuid not null,
  table_name text not null check(table_name in ('sources','persons','person_names','person_facts','unions','union_partners','union_children','parent_links','citations')),
  entity_id uuid not null,
  row_snapshot jsonb not null check(jsonb_typeof(row_snapshot)='object'),
  primary key(job_id,table_name,entity_id),
  unique(tree_id,table_name,entity_id),
  foreign key(tree_id,job_id) references private.import_jobs(tree_id,id) on delete cascade
);
alter table private.import_chunks enable row level security;
alter table private.import_chunks force row level security;
alter table private.import_owned_rows enable row level security;
alter table private.import_owned_rows force row level security;
revoke all on private.import_chunks,private.import_owned_rows from public,anon,authenticated;

create function private.import_chunk_plan_immutable() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
  if (new.tree_id,new.job_id,new.approval_id,new.sequence,new.phase,new.row_numbers,new.snapshot_hash,new.chunk_hash,new.approved_version)
    is distinct from (old.tree_id,old.job_id,old.approval_id,old.sequence,old.phase,old.row_numbers,old.snapshot_hash,old.chunk_hash,old.approved_version)
    or old.status='completed' then
    raise exception using errcode='40001',message='import chunk plan and committed result are immutable';
  end if;
  return new;
end;
$$;
create trigger import_chunk_plan_immutable before update on private.import_chunks
for each row execute function private.import_chunk_plan_immutable();
revoke all on function private.import_chunk_plan_immutable() from public,anon,authenticated;

-- Canonical row creation is shared with the established atomic path; no direct client grant.
create function private.import_write_rows(p_job_id uuid,p_source_id uuid,p_people_rows integer[],p_family_rows integer[])
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,extensions as $$
declare
  v_actor uuid:=auth.uid(); v_job private.import_jobs%rowtype;
  v_row private.import_rows%rowtype; v_mapping record; v_edge record;
  v_source uuid:=coalesce(p_source_id,gen_random_uuid());
  v_person uuid; v_union uuid; v_parent uuid; v_child uuid; v_link uuid; v_fact uuid;
  v_count bigint:=0; v_union_count bigint:=0; v_link_count bigint:=0;
  v_gender text; v_record_type text;
  v_people_ids uuid[]:='{}'; v_union_ids uuid[]:='{}'; v_link_ids uuid[]:='{}';
  v_group record;
begin
  select * into strict v_job from private.import_jobs where id=p_job_id;
  if p_source_id is null then
  insert into private.sources(id,tree_id,created_by,title,kind,provenance,visibility,rights_note,provider_name,original_asset_id)
    values(v_source,v_job.tree_id,v_actor,'Nguồn nhập demo · '||left(v_job.file_sha256,12),'document',
      'Nhập từ batch '||v_job.id||'; SHA-256 '||v_job.file_sha256,'restricted','Synthetic demo import; original retained in private storage',v_job.source_namespace,v_job.source_asset_id);
  end if;

  for v_row in select r.* from private.import_rows r where r.job_id=v_job.id and r.row_number=any(p_people_rows)
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
    v_people_ids:=array_append(v_people_ids,v_person);
    v_count:=v_count+1;
  end loop;

  for v_mapping in
    select m.family_row_number,m.mapping,f.external_id,f.normalized
    from private.import_relationship_mappings m
    join private.import_rows f on f.tree_id=m.tree_id and f.job_id=m.job_id and f.row_number=m.family_row_number
    where m.tree_id=v_job.tree_id and m.job_id=v_job.id and m.family_row_number=any(p_family_rows)
      and not exists(select 1 from private.import_row_decisions d where d.tree_id=f.tree_id and d.job_id=f.job_id and d.row_number=f.row_number and d.excluded)
    order by m.family_row_number
  loop
    select canonical_id into v_union from private.external_id_map where tree_id=v_job.tree_id
      and source_namespace=v_job.source_namespace and external_id=v_mapping.external_id and entity_kind='family' for update;
    if v_union is null then raise exception using errcode='23503',message='stable family identity mapping missing'; end if;
    insert into private.unions(id,tree_id,created_by,kind,status) values(v_union,v_job.tree_id,v_actor,'unknown','unknown');
    v_union_ids:=array_append(v_union_ids,v_union);
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
      v_link_ids:=array_append(v_link_ids,v_link);
      v_link_count:=v_link_count+1;
    end loop;
  end loop;


  -- Capture exact created rows once. A later edit must never refresh its ownership snapshot.
  for v_group in
    select 'persons' name,v_people_ids ids
    union all select 'sources',array[v_source]
    union all select 'person_names',coalesce(array_agg(n.id),'{}') from private.person_names n where n.tree_id=v_job.tree_id and n.person_id=any(v_people_ids)
    union all select 'person_facts',coalesce(array_agg(f.id),'{}') from private.person_facts f where f.tree_id=v_job.tree_id and f.person_id=any(v_people_ids)
    union all select 'unions',v_union_ids
    union all select 'union_partners',coalesce(array_agg(p.id),'{}') from private.union_partners p where p.tree_id=v_job.tree_id and p.union_id=any(v_union_ids)
    union all select 'union_children',coalesce(array_agg(c.id),'{}') from private.union_children c where c.tree_id=v_job.tree_id and c.union_id=any(v_union_ids)
    union all select 'parent_links',v_link_ids
    union all select 'citations',coalesce(array_agg(c.id),'{}') from private.citations c
      where c.tree_id=v_job.tree_id and c.source_id=v_source and (c.person_id=any(v_people_ids) or c.union_id=any(v_union_ids)
        or c.parent_link_id=any(v_link_ids) or c.fact_id in(select f.id from private.person_facts f where f.tree_id=v_job.tree_id and f.person_id=any(v_people_ids)))
  loop
    execute format('insert into private.import_owned_rows(tree_id,job_id,table_name,entity_id,row_snapshot)
      select $1,$2,$3,t.id,to_jsonb(t) from private.%I t where t.tree_id=$1 and t.id=any($4)
      on conflict(job_id,table_name,entity_id) do nothing',v_group.name)
      using v_job.tree_id,v_job.id,v_group.name,v_group.ids;
  end loop;
  if v_union_count>0 or v_link_count>0 then
    update private.trees set graph_revision=graph_revision+1 where id=v_job.tree_id;
  end if;
  return jsonb_build_object('sourceId',v_source,'appliedPeople',v_count,'appliedUnions',v_union_count,'appliedParentLinks',v_link_count);
end;
$$;
revoke all on function private.import_write_rows(uuid,uuid,integer[],integer[]) from public,anon,authenticated;

-- Lock and compare the full canonical rows, including versions, deletion state and scalar values.
create function private.import_owned_rows_unchanged(p_job_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare v_table text; v_row record; v_seen bigint; v_expected bigint;
begin
  for v_table in select distinct o.table_name from private.import_owned_rows o where o.job_id=p_job_id order by o.table_name loop
    v_seen:=0;
    for v_row in execute format('select to_jsonb(t) actual,o.row_snapshot expected from private.%I t
      join private.import_owned_rows o on o.entity_id=t.id and o.tree_id=t.tree_id and o.table_name=$2
      where o.job_id=$1 order by t.id for share of t',v_table) using p_job_id,v_table
    loop
      if v_row.actual is distinct from v_row.expected then return false; end if;
      v_seen:=v_seen+1;
    end loop;
    select count(*) into v_expected from private.import_owned_rows o where o.job_id=p_job_id and o.table_name=v_table;
    if v_seen<>v_expected then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.import_owned_rows_unchanged(uuid) from public,anon,authenticated;
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
  v_people_rows integer[]; v_family_rows integer[]; v_result jsonb;
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
  select array_agg(r.row_number order by r.row_number) into v_people_rows from private.import_rows r
    where r.job_id=v_job.id and coalesce(r.normalized->>'recordType','INDI') in ('INDI','PERSON')
      and not exists(select 1 from private.import_row_decisions d where d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number and d.excluded);
  select array_agg(m.family_row_number order by m.family_row_number) into v_family_rows from private.import_relationship_mappings m where m.job_id=v_job.id;
  if cardinality(v_people_rows)>2000 or exists(select 1 from private.import_chunks c where c.job_id=v_job.id and c.status='completed') then
    raise exception using errcode='22023',message='batch requires chunk continuation';
  end if;
  v_result:=private.import_write_rows(v_job.id,null,coalesce(v_people_rows,'{}'),coalesce(v_family_rows,'{}'));
  v_source:=(v_result->>'sourceId')::uuid;
  v_count:=(v_result->>'appliedPeople')::bigint;
  v_union_count:=(v_result->>'appliedUnions')::bigint;
  v_link_count:=(v_result->>'appliedParentLinks')::bigint;
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

  if v_included_people<1 or v_included_people>10000
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

create or replace function private.import_relationship_graph_is_safe(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tree_id uuid;
  v_duplicate boolean;
  v_over_limit boolean;
  v_cycle boolean;
begin
  select j.tree_id into v_tree_id from private.import_jobs j where j.id=p_job_id for share;
  if not found then return false; end if;
  perform private.import_require_demo_tree(v_tree_id);
  -- Same tree-wide lock used by canonical parent-link proposal apply.
  perform pg_advisory_xact_lock(hashtextextended(v_tree_id::text,0));
  if not private.import_relationship_batch_complete(p_job_id) then return false; end if;

  with proposed as (
    select parent_map.canonical_id parent_id, child_map.canonical_id child_id,
      edge.value->>'kind' kind, edge.value->>'status' status
    from private.import_relationship_mappings mapping
    join private.import_jobs job on job.id=mapping.job_id and job.tree_id=mapping.tree_id
    join private.import_rows family on family.tree_id=mapping.tree_id and family.job_id=mapping.job_id
      and family.row_number=mapping.family_row_number
    cross join lateral jsonb_array_elements(coalesce(mapping.mapping->'parentLinks','[]'::jsonb)) edge(value)
    join private.external_id_map parent_map on parent_map.tree_id=job.tree_id and parent_map.source_namespace=job.source_namespace
      and parent_map.external_id=edge.value->>'parentExternalId' and parent_map.entity_kind='person'
    join private.external_id_map child_map on child_map.tree_id=job.tree_id and child_map.source_namespace=job.source_namespace
      and child_map.external_id=edge.value->>'childExternalId' and child_map.entity_kind='person'
    where job.id=p_job_id
  )
  select exists(
      select 1 from proposed group by parent_id,child_id,kind having count(*)>1
    ) or exists(
      select 1 from proposed p join private.parent_links current_link
        on current_link.tree_id=v_tree_id and current_link.parent_id=p.parent_id
        and current_link.child_id=p.child_id and current_link.kind=p.kind
      where not exists(select 1 from private.import_owned_rows o where o.job_id=p_job_id
        and o.table_name='parent_links' and o.entity_id=current_link.id and o.row_snapshot=to_jsonb(current_link))
    ) into v_duplicate;
  if v_duplicate then return false; end if;

  with proposed_bio as (
    select parent_map.canonical_id parent_id, child_map.canonical_id child_id
    from private.import_relationship_mappings mapping
    join private.import_jobs job on job.id=mapping.job_id and job.tree_id=mapping.tree_id
    cross join lateral jsonb_array_elements(coalesce(mapping.mapping->'parentLinks','[]'::jsonb)) edge(value)
    join private.external_id_map parent_map on parent_map.tree_id=job.tree_id and parent_map.source_namespace=job.source_namespace
      and parent_map.external_id=edge.value->>'parentExternalId' and parent_map.entity_kind='person'
    join private.external_id_map child_map on child_map.tree_id=job.tree_id and child_map.source_namespace=job.source_namespace
      and child_map.external_id=edge.value->>'childExternalId' and child_map.entity_kind='person'
    where job.id=p_job_id and edge.value->>'kind'='biological' and edge.value->>'status'='confirmed'
  ), all_bio as (
    select pl.parent_id,pl.child_id from private.parent_links pl
      where pl.tree_id=v_tree_id and pl.deleted_at is null and pl.kind='biological' and pl.status='confirmed'
    union
    select parent_id,child_id from proposed_bio
  )
  select exists(select 1 from all_bio group by child_id having count(distinct parent_id)>2)
    into v_over_limit;
  if v_over_limit then return false; end if;

  with recursive proposed as (
    select parent_map.canonical_id parent_id, child_map.canonical_id child_id,
      edge.value->>'kind' kind, edge.value->>'status' status
    from private.import_relationship_mappings mapping
    join private.import_jobs job on job.id=mapping.job_id and job.tree_id=mapping.tree_id
    cross join lateral jsonb_array_elements(coalesce(mapping.mapping->'parentLinks','[]'::jsonb)) edge(value)
    join private.external_id_map parent_map on parent_map.tree_id=job.tree_id and parent_map.source_namespace=job.source_namespace
      and parent_map.external_id=edge.value->>'parentExternalId' and parent_map.entity_kind='person'
    join private.external_id_map child_map on child_map.tree_id=job.tree_id and child_map.source_namespace=job.source_namespace
      and child_map.external_id=edge.value->>'childExternalId' and child_map.entity_kind='person'
    where job.id=p_job_id and edge.value->>'status'='confirmed'
      and edge.value->>'kind' in ('biological','adoptive')
  ), graph_edges as (
    select pl.parent_id,pl.child_id from private.parent_links pl
      where pl.tree_id=v_tree_id and pl.deleted_at is null and pl.status='confirmed'
        and pl.kind in ('biological','adoptive')
    union
    select parent_id,child_id from proposed
  ), reach(start_id,node_id) as (
    select parent_id,child_id from proposed
    union
    select reach.start_id,edge.child_id
    from reach join graph_edges edge on edge.parent_id=reach.node_id
  )
  select exists(select 1 from reach where start_id=node_id) into v_cycle;
  return not v_cycle;
end;
$$;

revoke all on function private.import_relationship_graph_is_safe(uuid) from public, anon, authenticated;

create or replace function private.import_job_state(p_job_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private
as $$
declare v_job private.import_jobs%rowtype; v_actor uuid:=auth.uid(); v_people bigint; v_total bigint; v_done bigint; v_next integer;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then
    raise exception using errcode='42501',message='import job unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  select count(*) into v_people from private.import_rows r where r.job_id=v_job.id
    and coalesce(r.normalized->>'recordType','INDI') in ('INDI','PERSON')
    and not exists(select 1 from private.import_row_decisions d where d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number and d.excluded);
  select count(*),count(*) filter(where c.status='completed'),min(c.sequence) filter(where c.status='pending')
    into v_total,v_done,v_next from private.import_chunks c where c.job_id=v_job.id
      and c.approval_id=coalesce(v_job.approval_id,nullif(v_job.manifest->>'chunkApprovalId','')::uuid);
  return jsonb_build_object('job',jsonb_build_object('id',v_job.id,'version',v_job.version,'kind','import',
    'status',v_job.status,'counters',v_job.counters,'warnings',coalesce(v_job.manifest->'warnings','[]'::jsonb),
    'errorCode',null,'expiresAt',null,'treeId',v_job.tree_id,'sourceAssetId',v_job.source_asset_id,
    'fileSha256',v_job.file_sha256,'format',v_job.format,'sourceNamespace',v_job.source_namespace,
    'mappingVersion',v_job.mapping_version,'classification',v_job.classification),
    'approvalId',v_job.approval_id,'approvedSnapshotHash',v_job.manifest->>'reviewedSnapshotHash',
    'canReview',v_job.status='needs_review' and v_actor<>v_job.created_by and private.has_mfa(),
    'canApply',v_job.status='ready' and v_people<=2000 and v_done=0 and v_actor::text is distinct from v_job.manifest->>'reviewerId' and private.has_mfa(),
    'canCancel',v_job.status in ('needs_review','ready','partially_applied') and private.has_mfa(),
    'canApplyChunk',v_job.status in ('ready','partially_applied') and v_actor::text is distinct from v_job.manifest->>'reviewerId' and private.has_mfa(),
    'chunkProgress',case when v_total>0 then jsonb_build_object('total',v_total,'committed',v_done,
      'nextSequence',case when v_job.status in ('ready','partially_applied') then v_next else null end) else null end,
    'appliedPeople',coalesce((v_job.manifest->>'appliedPeople')::bigint,0),
    'appliedUnions',coalesce((v_job.manifest->>'appliedUnions')::bigint,0),
    'appliedParentLinks',coalesce((v_job.manifest->>'appliedParentLinks')::bigint,0));
end;
$$;

create or replace function api.import_job_state(p_job_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.import_job_state($1); $$;
revoke all on function api.import_job_state(uuid) from public,anon,authenticated;
grant execute on function api.import_job_state(uuid) to authenticated;


create function private.import_chunk_apply(p_job_id uuid,p_base_version bigint,p_snapshot_hash text,p_approval_id uuid,p_sequence integer,p_key uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,extensions as $$
declare
  v_actor uuid:=auth.uid(); v_job private.import_jobs%rowtype; v_chunk private.import_chunks%rowtype;
  v_row record; v_seq integer:=0; v_result jsonb; v_response jsonb;
  v_people bigint; v_unions bigint; v_links bigint; v_done bigint; v_total bigint; v_source uuid;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_base_version is null or p_base_version<1 or p_snapshot_hash is null or p_snapshot_hash !~ '^[a-f0-9]{64}$'
    or p_approval_id is null or p_sequence is null or p_sequence<1 or p_key is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='valid chunk identity, version, approval and idempotency required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) or not private.has_mfa() then
    raise exception using errcode='42501',message='MFA and imports.manage required'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if v_job.manifest->>'reviewerId' is null or v_job.manifest->>'reviewerId'=v_actor::text then
    raise exception using errcode='42501',message='independent reviewer required'; end if;
  -- Completed chunk replay is durable, actor-bound and still authorized, even after cancellation.
  select * into v_chunk from private.import_chunks c where c.job_id=v_job.id and c.approval_id=p_approval_id
    and c.sequence=p_sequence and c.status='completed';
  if found then
    if v_chunk.actor_id<>v_actor or v_chunk.base_version<>p_base_version or v_chunk.idempotency_key<>p_key
       or v_chunk.request_hash<>p_hash or v_chunk.snapshot_hash<>p_snapshot_hash then
      raise exception using errcode='P0008',message='chunk replay request mismatch'; end if;
    return v_chunk.response;
  end if;
  if exists(select 1 from private.import_chunks c where c.tree_id=v_job.tree_id and c.actor_id=v_actor and c.idempotency_key=p_key) then
    raise exception using errcode='P0008',message='chunk key already used'; end if;
  if v_job.status not in ('ready','partially_applied') or v_job.version<>p_base_version
    or v_job.approval_id is distinct from p_approval_id or v_job.manifest->>'reviewedSnapshotHash' is distinct from p_snapshot_hash
    or v_job.manifest->>'previewHash' is distinct from p_snapshot_hash
    or private.import_current_snapshot(v_job.id) is distinct from p_snapshot_hash then
    raise exception using errcode='40001',message='chunk approval, snapshot or version changed'; end if;
  perform 1 from private.media_assets m where m.id=v_job.source_asset_id and m.tree_id=v_job.tree_id
    and m.purpose='import' and m.state='ready' and m.expected_sha256=v_job.file_sha256 and m.actual_sha256=v_job.file_sha256 for share;
  if not found then raise exception using errcode='40001',message='approved source is no longer ready'; end if;
  if not private.import_relationship_batch_complete(v_job.id)
    or not private.import_relationship_graph_is_safe(v_job.id)
    or not private.import_owned_rows_unchanged(v_job.id) then
    raise exception using errcode='40001',message='chunk graph, coverage or applied rows changed'; end if;
  if not exists(select 1 from private.import_chunks c where c.job_id=v_job.id and c.approval_id=p_approval_id) then
    if v_job.status<>'ready' or p_sequence<>1 or coalesce((v_job.manifest->>'appliedPeople')::bigint,0)<>0
      or (v_job.manifest->>'reviewedVersion')::bigint<>v_job.version-1 then
      raise exception using errcode='40001',message='chunk plan must start from unchanged approval'; end if;
    -- All people precede families; every family is a bounded dependency transaction.
    for v_row in
      select array_agg(r.row_number order by r.row_number) rows from (
        select r.row_number,(row_number() over(order by r.row_number)-1)/500 group_no
        from private.import_rows r where r.job_id=v_job.id and coalesce(r.normalized->>'recordType','INDI') in ('INDI','PERSON')
          and not exists(select 1 from private.import_row_decisions d where d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number and d.excluded)
      ) r group by r.group_no order by r.group_no
    loop
      v_seq:=v_seq+1;
      insert into private.import_chunks(tree_id,job_id,approval_id,sequence,phase,row_numbers,snapshot_hash,chunk_hash,approved_version)
        values(v_job.tree_id,v_job.id,p_approval_id,v_seq,'people',v_row.rows,p_snapshot_hash,
          encode(extensions.digest(concat_ws(':',p_snapshot_hash,'people',v_seq,v_row.rows::text),'sha256'),'hex'),v_job.version);
    end loop;
    for v_row in select m.family_row_number from private.import_relationship_mappings m
      where m.job_id=v_job.id and not exists(select 1 from private.import_row_decisions d where d.tree_id=m.tree_id
        and d.job_id=m.job_id and d.row_number=m.family_row_number and d.excluded) order by m.family_row_number
    loop
      v_seq:=v_seq+1;
      insert into private.import_chunks(tree_id,job_id,approval_id,sequence,phase,row_numbers,snapshot_hash,chunk_hash,approved_version)
        values(v_job.tree_id,v_job.id,p_approval_id,v_seq,'families',array[v_row.family_row_number],p_snapshot_hash,
          encode(extensions.digest(concat_ws(':',p_snapshot_hash,'families',v_seq,array[v_row.family_row_number]::text),'sha256'),'hex'),v_job.version);
    end loop;
  end if;
  select * into v_chunk from private.import_chunks c where c.job_id=v_job.id and c.approval_id=p_approval_id
    and c.status='pending' order by c.sequence limit 1 for update;
  if not found or v_chunk.sequence<>p_sequence or v_chunk.snapshot_hash<>p_snapshot_hash
    or v_chunk.chunk_hash<>encode(extensions.digest(concat_ws(':',p_snapshot_hash,v_chunk.phase,v_chunk.sequence,v_chunk.row_numbers::text),'sha256'),'hex') then
    raise exception using errcode='40001',message='next chunk or immutable plan changed'; end if;
  v_source:=nullif(v_job.manifest->>'sourceId','')::uuid;
  v_result:=private.import_write_rows(v_job.id,v_source,
    case when v_chunk.phase='people' then v_chunk.row_numbers else '{}'::integer[] end,
    case when v_chunk.phase='families' then v_chunk.row_numbers else '{}'::integer[] end);
  select count(*),count(*) filter(where c.status='completed')+1 into v_total,v_done
    from private.import_chunks c where c.job_id=v_job.id and c.approval_id=p_approval_id;
  v_people:=coalesce((v_job.manifest->>'appliedPeople')::bigint,0)+(v_result->>'appliedPeople')::bigint;
  v_unions:=coalesce((v_job.manifest->>'appliedUnions')::bigint,0)+(v_result->>'appliedUnions')::bigint;
  v_links:=coalesce((v_job.manifest->>'appliedParentLinks')::bigint,0)+(v_result->>'appliedParentLinks')::bigint;
  update private.import_jobs set version=version+1,status=case when v_done=v_total then 'completed' else 'partially_applied' end,
    counters=jsonb_build_object('processed',v_people+case when v_done=v_total then coalesce((manifest->>'excluded')::bigint,0) else 0 end,
      'succeeded',v_people,'failed',0,'skipped',case when v_done=v_total then coalesce((manifest->>'excluded')::bigint,0) else 0 end),
    manifest=manifest||jsonb_build_object('sourceId',v_result->'sourceId','chunkApprovalId',p_approval_id,'appliedPeople',v_people,'appliedUnions',v_unions,
      'appliedParentLinks',v_links,'completedChunks',v_done,'totalChunks',v_total,'appliedBy',v_actor)
      ||case when v_done=v_total then jsonb_build_object('completedAt',clock_timestamp()) else '{}'::jsonb end
    where id=v_job.id returning * into v_job;
  -- Derive the response before finishing the immutable ledger entry; mark its progress explicitly.
  v_response:=private.import_job_state(v_job.id)||jsonb_build_object('chunkProgress',
    jsonb_build_object('total',v_total,'committed',v_done,'nextSequence',case when v_done<v_total then p_sequence+1 else null end));
  update private.import_chunks set status='completed',actor_id=v_actor,base_version=p_base_version,idempotency_key=p_key,
    request_hash=p_hash,result=v_result,response=v_response,committed_at=clock_timestamp()
    where job_id=v_job.id and approval_id=p_approval_id and sequence=p_sequence;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.chunk_applied','import',v_job.id,gen_random_uuid(),'Approved synthetic import chunk committed; previous chunks remain persisted');
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by)
    values(v_job.tree_id,case when v_done=v_total then 'import.completed' else 'import.chunk_applied' end,v_job.id,v_job.version,
      'import.chunk:'||v_job.id||':'||p_approval_id||':'||p_sequence,v_actor) on conflict(dedupe_key) do nothing;
  return v_response;
end;
$$;
create function api.import_chunk_apply(p_job_id uuid,p_base_version bigint,p_snapshot_hash text,p_approval_id uuid,p_sequence integer,p_key uuid,p_hash text)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select private.import_chunk_apply($1,$2,$3,$4,$5,$6,$7); $$;
revoke all on function private.import_chunk_apply(uuid,bigint,text,uuid,integer,uuid,text),api.import_chunk_apply(uuid,bigint,text,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function private.import_chunk_apply(uuid,bigint,text,uuid,integer,uuid,text),api.import_chunk_apply(uuid,bigint,text,uuid,integer,uuid,text) to authenticated;
create or replace function private.import_cancel(
  p_job_id uuid,p_expected_version bigint,p_reason text,p_idempotency_key uuid,p_request_hash text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,extensions
as $$
declare
  v_actor uuid:=auth.uid();
  v_job private.import_jobs%rowtype;
  v_existing private.idempotency_records%rowtype;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_expected_version is null or p_expected_version<1 or p_reason is null or length(btrim(p_reason)) not between 5 and 1000
     or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='valid cancel version, reason and idempotency required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then
    raise exception using errcode='42501',message='import cancellation unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if not private.has_mfa() then raise exception using errcode='42501',message='MFA required for import cancellation'; end if;

  select * into v_existing from private.idempotency_records r where r.tree_id=v_job.tree_id and r.actor_id=v_actor
    and r.operation='import.cancel' and r.idempotency_key=p_idempotency_key and r.expires_at>clock_timestamp() for update;
  if found then
    if v_existing.request_hash<>p_request_hash or v_existing.response->>'jobId'<>v_job.id::text then
      raise exception using errcode='P0008',message='cancel replay does not match the original request'; end if;
    return private.import_job_state(v_job.id)||jsonb_build_object('canCancel',false);
  end if;

  if v_job.version<>p_expected_version then raise exception using errcode='40001',message='import job version changed'; end if;
  if v_job.status not in ('needs_review','ready','partially_applied') then
    raise exception using errcode='40001',message='only a reviewed or partially applied import can be cancelled'; end if;
  if v_job.status<>'partially_applied' and (coalesce((v_job.manifest->>'appliedPeople')::bigint,0)<>0
     or coalesce((v_job.manifest->>'appliedUnions')::bigint,0)<>0
     or coalesce((v_job.manifest->>'appliedParentLinks')::bigint,0)<>0
     or exists(select 1 from private.import_rows r join private.external_id_map m on m.tree_id=r.tree_id
       and m.source_namespace=v_job.source_namespace and m.external_id=r.external_id
       and m.entity_kind=case when r.normalized->>'recordType'='FAM' then 'family' else 'person' end
       where r.tree_id=v_job.tree_id and r.job_id=v_job.id and (
         exists(select 1 from private.persons p where p.tree_id=m.tree_id and p.id=m.canonical_id)
         or exists(select 1 from private.unions u where u.tree_id=m.tree_id and u.id=m.canonical_id)))) then
    raise exception using errcode='40001',message='canonical writes exist; cancellation cannot discard applied data'; end if;

  update private.import_jobs set status='cancelled',version=version+1,approval_id=null,approval_hash=null,
    manifest=manifest||jsonb_build_object('cancelledAt',clock_timestamp(),'cancelledBy',v_actor,
      'cancelReasonHash',encode(extensions.digest(btrim(p_reason),'sha256'),'hex'))
    where id=v_job.id returning * into v_job;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.cancelled','import',v_job.id,gen_random_uuid(),'Synthetic import cancelled; committed rows retained and reason represented by digest only');
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(v_job.tree_id,v_actor,'import.cancel',p_idempotency_key,p_request_hash,
      jsonb_build_object('jobId',v_job.id,'version',v_job.version,'status',v_job.status),clock_timestamp()+interval '24 hours');
  return private.import_job_state(v_job.id)||jsonb_build_object('canCancel',false);
end;
$$;

create or replace function api.import_cancel(p_job_id uuid,p_expected_version bigint,p_reason text,p_idempotency_key uuid,p_request_hash text)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select private.import_cancel($1,$2,$3,$4,$5); $$;

revoke all on function private.import_cancel(uuid,bigint,text,uuid,text) from public,anon,authenticated;
grant execute on function private.import_cancel(uuid,bigint,text,uuid,text) to authenticated;
revoke all on function api.import_cancel(uuid,bigint,text,uuid,text) from public,anon,authenticated;
grant execute on function api.import_cancel(uuid,bigint,text,uuid,text) to authenticated;


commit;
