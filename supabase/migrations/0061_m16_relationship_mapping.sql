-- M16-04: persist explicit relationship review decisions privately and bind them
-- to the import snapshot. This migration does not enable canonical apply.
begin;

create table if not exists private.import_relationship_mappings (
  tree_id uuid not null,
  job_id uuid not null,
  family_row_number integer not null,
  mapping jsonb not null check (jsonb_typeof(mapping) = 'object'),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default clock_timestamp(),
  primary key (tree_id, job_id, family_row_number),
  foreign key (tree_id, job_id, family_row_number)
    references private.import_rows(tree_id, job_id, row_number) on delete cascade
);
alter table private.import_relationship_mappings enable row level security;
alter table private.import_relationship_mappings force row level security;
revoke all on private.import_relationship_mappings from public, anon, authenticated;

create or replace function private.import_current_snapshot(p_job_id uuid)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  with raw as (
    select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('rowNumber',r.row_number,
      'externalId',r.external_id,'rawPayload',r.raw_payload,'normalized',r.normalized,'status',r.status,'errors',r.errors)
      order by r.row_number)::text,'[]'),'sha256'),'hex') hash
    from private.import_rows r where r.job_id=p_job_id
  ), decisions as (
    select jsonb_agg(jsonb_build_object('rowNumber',d.row_number,'excluded',d.excluded,'reason',d.reason,
      'decidedBy',d.decided_by,'decidedAt',d.decided_at) order by d.row_number) value
    from private.import_row_decisions d where d.job_id=p_job_id
  ), mappings as (
    select jsonb_agg(jsonb_build_object('familyRowNumber',m.family_row_number,'mapping',m.mapping,
      'reason',m.reason,'decidedBy',m.decided_by,'decidedAt',m.decided_at) order by m.family_row_number) value
    from private.import_relationship_mappings m where m.job_id=p_job_id
  ), reviewed as (
    select case when decisions.value is null then raw.hash
      else encode(extensions.digest(raw.hash||':'||decisions.value::text,'sha256'),'hex') end hash,
      mappings.value from raw cross join decisions cross join mappings
  )
  select case when reviewed.value is null then reviewed.hash
    else encode(extensions.digest(reviewed.hash||':relationships:'||reviewed.value::text,'sha256'),'hex') end
  from reviewed;
$$;
revoke all on function private.import_current_snapshot(uuid) from public, anon, authenticated;

create or replace function private.import_relationship_mapping_save(
  p_job_id uuid, p_base_version bigint, p_snapshot_hash text, p_mapping jsonb,
  p_key uuid, p_hash text
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_actor uuid := auth.uid(); v_job private.import_jobs%rowtype; v_existing private.idempotency_records%rowtype;
  v_family text; v_partners jsonb; v_children jsonb; v_edges jsonb; v_reason text;
  v_family_row integer; v_new_snapshot text; v_request jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) or not private.has_mfa() then
    raise exception using errcode='42501',message='MFA and imports.manage required'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if p_base_version is null or p_base_version<1 or p_snapshot_hash is null or p_snapshot_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_mapping) is distinct from 'object' or p_key is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='invalid relationship mapping request'; end if;
  if exists(select 1 from jsonb_object_keys(p_mapping) k where k not in
    ('baseVersion','snapshotHash','familyExternalId','partnerExternalIds','childExternalIds','parentLinks','reason')) then
    raise exception using errcode='22023',message='relationship mapping contains unsupported fields'; end if;
  v_family:=p_mapping->>'familyExternalId'; v_reason:=btrim(p_mapping->>'reason');
  v_partners:=p_mapping->'partnerExternalIds'; v_children:=p_mapping->'childExternalIds'; v_edges:=p_mapping->'parentLinks';
  if (p_mapping->>'baseVersion')::bigint is distinct from p_base_version
     or p_mapping->>'snapshotHash' is distinct from p_snapshot_hash
     or v_family is null or length(v_family) not between 1 and 300
     or jsonb_typeof(v_partners) is distinct from 'array' or jsonb_array_length(v_partners) not between 1 and 100
     or jsonb_typeof(v_children) is distinct from 'array' or jsonb_array_length(v_children)>1000
     or jsonb_typeof(v_edges) is distinct from 'array' or jsonb_array_length(v_edges)>2000
     or v_reason is null or length(v_reason) not between 1 and 1000 then
    raise exception using errcode='22023',message='incomplete relationship mapping'; end if;
  v_request:=jsonb_build_object('jobId',p_job_id,'baseVersion',p_base_version,'snapshotHash',p_snapshot_hash,'mapping',p_mapping);
  perform pg_advisory_xact_lock(hashtextextended(v_job.tree_id::text||':'||v_actor::text||':import.relationship:'||p_key::text,0));
  select * into v_existing from private.idempotency_records r where r.tree_id=v_job.tree_id and r.actor_id=v_actor
    and r.operation='import.relationship' and r.idempotency_key=p_key and r.expires_at>clock_timestamp() for update;
  if found then
    if v_existing.request_hash is distinct from p_hash or v_existing.response->'request' is distinct from v_request then
      raise exception using errcode='P0008',message='relationship mapping replay mismatch'; end if;
    return v_existing.response->'result';
  end if;
  if v_job.status not in ('needs_review','ready') or v_job.version<>p_base_version
     or v_job.manifest->>'previewHash' is distinct from p_snapshot_hash
     or private.import_current_snapshot(p_job_id) is distinct from p_snapshot_hash then
    raise exception using errcode='40001',message='import preview changed'; end if;
  select r.row_number into v_family_row from private.import_rows r where r.tree_id=v_job.tree_id and r.job_id=p_job_id
    and r.external_id=v_family and r.normalized->>'recordType'='FAM' and r.status in ('valid','review')
    and not exists(select 1 from jsonb_array_elements_text(r.errors) e(value) where e.value<>'relationship_mapping_requires_review')
    and not exists(select 1 from private.import_row_decisions d where d.job_id=r.job_id and d.row_number=r.row_number and d.excluded)
    and (select count(*) from private.import_rows same_id where same_id.job_id=r.job_id and same_id.external_id=v_family)=1 for update;
  if v_family_row is null then raise exception using errcode='22023',message='family source row is unavailable'; end if;
  if exists(select 1 from jsonb_array_elements_text(v_partners) x(value)
    where not exists(select 1 from private.import_rows f cross join lateral jsonb_array_elements(f.normalized->'partnerRefs') p(value)
      where f.job_id=p_job_id and f.row_number=v_family_row and p.value->>'xref'=x.value))
     or exists(select 1 from jsonb_array_elements_text(v_children) x(value)
       where not exists(select 1 from private.import_rows f cross join lateral jsonb_array_elements_text(f.normalized->'childRefs') c(value)
         where f.job_id=p_job_id and f.row_number=v_family_row and c.value=x.value)) then
    raise exception using errcode='22023',message='selected participants do not match source family references'; end if;
  if exists(select 1 from (
      select value from jsonb_array_elements_text(v_partners)
      union all select value from jsonb_array_elements_text(v_children)
    ) participants group by value having count(*)>1) then
    raise exception using errcode='22023',message='duplicate family participant'; end if;
  if exists(select value from (
      select value from jsonb_array_elements_text(v_partners)
      union select value from jsonb_array_elements_text(v_children)
    ) participants where (select count(*) from private.import_rows same_id
      where same_id.job_id=p_job_id and same_id.external_id=participants.value)<>1) then
    raise exception using errcode='22023',message='ambiguous participant external identity'; end if;
  if exists(select 1 from (select value from jsonb_array_elements_text(v_partners)
      union all select value from jsonb_array_elements_text(v_children)) selected
    where not exists(select 1 from private.import_rows r where r.job_id=p_job_id and r.external_id=selected.value
      and r.normalized->>'recordType' in ('INDI','PERSON') and r.status in ('valid','review')
      and not exists(select 1 from jsonb_array_elements_text(r.errors) e(value) where e.value<>'relationship_mapping_requires_review')
      and not exists(select 1 from private.import_row_decisions d where d.job_id=r.job_id and d.row_number=r.row_number and d.excluded))) then
    raise exception using errcode='22023',message='selected participant must be a valid, included person row'; end if;
  if exists(select 1 from jsonb_array_elements(v_edges) e(value) where jsonb_typeof(e.value) is distinct from 'object') then
    raise exception using errcode='22023',message='each parent link must be an object'; end if;
  if exists(select 1 from jsonb_array_elements(v_edges) e(value)
    where exists(select 1 from jsonb_object_keys(e.value) k where k not in ('parentExternalId','childExternalId','kind','status'))
      or e.value->>'parentExternalId' is null or e.value->>'childExternalId' is null
      or e.value->>'kind' not in ('biological','adoptive','guardian','step')
      or e.value->>'status' not in ('confirmed','disputed')
      or not (v_partners ? (e.value->>'parentExternalId'))
      or not (v_children ? (e.value->>'childExternalId'))
      or e.value->>'parentExternalId'=e.value->>'childExternalId') then
    raise exception using errcode='22023',message='parent links must explicitly connect selected distinct partners and children'; end if;
  if exists(select 1 from jsonb_array_elements(v_edges) e(value)
    group by e.value->>'parentExternalId',e.value->>'childExternalId',e.value->>'kind' having count(*)>1) then
    raise exception using errcode='22023',message='duplicate explicit parent link'; end if;
  insert into private.import_relationship_mappings(tree_id,job_id,family_row_number,mapping,reason,decided_by)
    values(v_job.tree_id,p_job_id,v_family_row,p_mapping,v_reason,v_actor)
    on conflict(tree_id,job_id,family_row_number) do update set mapping=excluded.mapping,reason=excluded.reason,
      decided_by=excluded.decided_by,decided_at=clock_timestamp();
  v_new_snapshot:=private.import_current_snapshot(p_job_id);
  update private.import_jobs set status='needs_review',version=version+1,approval_id=null,approval_hash=null,
    manifest=(manifest-'reviewerId'-'reviewedVersion'-'reviewedSnapshotHash')||jsonb_build_object('previewHash',v_new_snapshot)
    where id=p_job_id returning * into v_job;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.relationship_mapping_saved','import',p_job_id,gen_random_uuid(),
      'Private explicit family relationship mapping saved; prior approval invalidated');
  delete from private.idempotency_records where tree_id=v_job.tree_id and actor_id=v_actor
    and operation='import.relationship' and idempotency_key=p_key and expires_at<=clock_timestamp();
  v_request:=jsonb_build_object('request',v_request,'result',jsonb_build_object('jobId',p_job_id,'version',v_job.version,
    'snapshotHash',v_new_snapshot,'mappingCount',(select count(*) from private.import_relationship_mappings where job_id=p_job_id)));
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(v_job.tree_id,v_actor,'import.relationship',p_key,p_hash,v_request,clock_timestamp()+interval '24 hours');
  return v_request->'result';
end;
$$;

create or replace function api.import_relationship_mapping_save(p_job_id uuid,p_base_version bigint,p_snapshot_hash text,
  p_mapping jsonb,p_key uuid,p_hash text) returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select private.import_relationship_mapping_save($1,$2,$3,$4,$5,$6); $$;
create or replace function private.import_relationship_rows(p_job_id uuid,p_base_version bigint,p_after integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_job private.import_jobs%rowtype; v_families jsonb; v_last integer; v_more boolean;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for share;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then
    raise exception using errcode='42501',message='import unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if p_base_version is null or p_base_version<1 or p_after is null or p_after not between 0 and 10000 then
    raise exception using errcode='22023',message='invalid relationship cursor'; end if;
  if v_job.version<>p_base_version then raise exception using errcode='40001',message='import version changed'; end if;
  with page as (
    select r.* from private.import_rows r where r.job_id=p_job_id and r.row_number>p_after
      and r.normalized->>'recordType'='FAM' order by r.row_number limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rowNumber',f.row_number,'familyExternalId',left(f.external_id,300),
      'partners',coalesce((select jsonb_agg(jsonb_build_object('externalId',left(p.value->>'xref',300),
        'displayName',coalesce(left(person.normalized->>'displayName',300),'(không tìm thấy bản ghi)'),
        'status',coalesce(person.status,'invalid'),'excluded',coalesce(d.excluded,false),
        'relationshipOnlyReview',coalesce(person.status='review' and person.errors ? 'relationship_mapping_requires_review'
          and not exists(select 1 from jsonb_array_elements_text(person.errors) e(value) where e.value<>'relationship_mapping_requires_review'),false)) order by p.ordinality)
        from jsonb_array_elements(coalesce(f.normalized->'partnerRefs','[]'::jsonb)) with ordinality p(value,ordinality)
        left join private.import_rows person on person.job_id=p_job_id and person.external_id=p.value->>'xref'
          and person.normalized->>'recordType' in ('INDI','PERSON')
        left join private.import_row_decisions d on d.job_id=person.job_id and d.row_number=person.row_number),'[]'::jsonb),
      'children',coalesce((select jsonb_agg(jsonb_build_object('externalId',left(c.value,300),
        'displayName',coalesce(left(person.normalized->>'displayName',300),'(không tìm thấy bản ghi)'),
        'status',coalesce(person.status,'invalid'),'excluded',coalesce(d.excluded,false),
        'relationshipOnlyReview',coalesce(person.status='review' and person.errors ? 'relationship_mapping_requires_review'
          and not exists(select 1 from jsonb_array_elements_text(person.errors) e(value) where e.value<>'relationship_mapping_requires_review'),false)) order by c.ordinality)
        from jsonb_array_elements_text(coalesce(f.normalized->'childRefs','[]'::jsonb)) with ordinality c(value,ordinality)
        left join private.import_rows person on person.job_id=p_job_id and person.external_id=c.value
          and person.normalized->>'recordType' in ('INDI','PERSON')
        left join private.import_row_decisions d on d.job_id=person.job_id and d.row_number=person.row_number),'[]'::jsonb),
      'savedMapping',(select jsonb_build_object('partnerExternalIds',m.mapping->'partnerExternalIds',
        'childExternalIds',m.mapping->'childExternalIds','parentLinks',m.mapping->'parentLinks')
        from private.import_relationship_mappings m where m.job_id=p_job_id and m.family_row_number=f.row_number)
    ) order by f.row_number),'[]'::jsonb),max(f.row_number)
    into v_families,v_last from page f;
  select exists(select 1 from private.import_rows r where r.job_id=p_job_id and r.row_number>v_last
    and r.normalized->>'recordType'='FAM') into v_more;
  return jsonb_build_object('jobId',p_job_id,'version',v_job.version,'families',v_families,
    'nextCursor',case when v_more then v_last else null end);
end;
$$;
create or replace function api.import_relationship_rows(p_job_id uuid,p_base_version bigint,p_after integer)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select private.import_relationship_rows($1,$2,$3); $$;
revoke all on function private.import_relationship_mapping_save(uuid,bigint,text,jsonb,uuid,text),
  api.import_relationship_mapping_save(uuid,bigint,text,jsonb,uuid,text),
  private.import_relationship_rows(uuid,bigint,integer),api.import_relationship_rows(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function private.import_relationship_mapping_save(uuid,bigint,text,jsonb,uuid,text),
  api.import_relationship_mapping_save(uuid,bigint,text,jsonb,uuid,text),
  private.import_relationship_rows(uuid,bigint,integer),api.import_relationship_rows(uuid,bigint,integer) to authenticated;
commit;
