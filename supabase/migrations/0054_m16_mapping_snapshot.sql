begin;

alter table private.import_jobs
  add column if not exists mapping_snapshot jsonb not null default '{}'::jsonb
  check (jsonb_typeof(mapping_snapshot) = 'object');

create or replace function private.import_mapping_attach(p_job_id uuid, p_mapping jsonb)
returns table(job_id uuid, version bigint)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_job private.import_jobs%rowtype;
  v_count integer;
  v_unique integer;
begin
  if v_actor is null then raise exception using errcode='28000', message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs j where j.id=p_job_id
    and private.has_capability(j.tree_id,'imports.manage',null) for update;
  if not found then raise exception using errcode='42501', message='import mapping is unavailable'; end if;
  if jsonb_typeof(p_mapping)<>'object'
     or p_mapping->>'mappingVersion'<>v_job.mapping_version
     or p_mapping->>'sourceNamespace'<>v_job.source_namespace
     or p_mapping->>'dateInterpretation' not in ('explicit_only','gregorian_dmy','lunar_dmy')
     or (v_job.format='csv' and v_job.mapping_version not like 'structured-csv/%')
     or (v_job.format='canonical_json' and v_job.mapping_version not like 'structured-json/%')
     or jsonb_typeof(p_mapping->'columns')<>'object' then
    raise exception using errcode='22023', message='structured mapping metadata is invalid';
  end if;
  select count(*),count(distinct value) into v_count,v_unique from jsonb_each_text(p_mapping->'columns');
  if v_count<2 or v_count>50 or v_count<>v_unique
     or not exists(select 1 from jsonb_each_text(p_mapping->'columns') e where e.value='externalId')
     or not exists(select 1 from jsonb_each_text(p_mapping->'columns') e where e.value='displayName')
     or exists(select 1 from jsonb_each_text(p_mapping->'columns') e where e.value not in ('externalId','displayName','birthDate','deathDate','gender','notes')) then
    raise exception using errcode='22023', message='structured mapping columns are invalid';
  end if;
  if v_job.mapping_snapshot <> '{}'::jsonb then
    if v_job.mapping_snapshot<>p_mapping then raise exception using errcode='P0008',message='import mapping snapshot is immutable'; end if;
    return query select v_job.id,v_job.version;
    return;
  end if;
  if v_job.status<>'queued' then raise exception using errcode='P0008',message='mapping can only be attached before parsing'; end if;
  update private.import_jobs j set mapping_snapshot=p_mapping,version=j.version+1,updated_at=clock_timestamp()
    where j.id=v_job.id returning j.* into v_job;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.mapping_attached','import',v_job.id,gen_random_uuid(),'Versioned structured mapping attached');
  return query select v_job.id,v_job.version;
end;
$$;

create or replace function api.import_mapping_attach(p_job_id uuid,p_mapping jsonb)
returns table(job_id uuid,version bigint)
language sql security invoker set search_path=pg_catalog,private
as $$ select * from private.import_mapping_attach($1,$2); $$;

revoke all on function private.import_mapping_attach(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.import_mapping_attach(uuid,jsonb) to authenticated;
revoke all on function api.import_mapping_attach(uuid,jsonb) from public,anon,authenticated;
grant execute on function api.import_mapping_attach(uuid,jsonb) to authenticated;

commit;
