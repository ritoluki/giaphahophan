-- Export-specific privacy projection. Does not widen the legacy person/source RPCs.
begin;
create table private.consent_records (
  id uuid primary key default gen_random_uuid(), tree_id uuid not null references private.trees(id), version bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id), person_id uuid not null, audience text not null check(audience in ('public','members','restricted')),
  field_groups jsonb not null check(jsonb_typeof(field_groups)='array' and jsonb_array_length(field_groups) between 1 and 20),
  purpose text not null, evidence_asset_id uuid, representative_person_id uuid,
  effective_at timestamptz not null, expires_at timestamptz, withdrawn_at timestamptz,
  foreign key(tree_id,person_id) references private.persons(tree_id,id),
  foreign key(tree_id,representative_person_id) references private.persons(tree_id,id),
  foreign key(tree_id,evidence_asset_id) references private.media_assets(tree_id,id), unique(tree_id,id),
  check(expires_at is null or expires_at>effective_at)
);
create index consent_records_export_lookup on private.consent_records(tree_id,person_id,audience,purpose,effective_at);
alter table private.consent_records enable row level security;
alter table private.consent_records force row level security;
revoke all on private.consent_records from public,anon,authenticated;

create function private.export_field_consent(p_tree uuid,p_person uuid,p_field text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select c.withdrawn_at is null and c.effective_at<=clock_timestamp()
    and (c.expires_at is null or c.expires_at>clock_timestamp())
    and exists(select 1 from private.media_assets a where a.tree_id=c.tree_id and a.id=c.evidence_asset_id and a.state='ready' and a.visibility='restricted')
    from private.consent_records c where c.tree_id=p_tree and c.person_id=p_person
      and c.audience='members' and c.purpose='genealogy-export' and c.field_groups ? p_field
    order by c.created_at desc,c.id desc limit 1),false);
$$;

create function private.export_projection(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_result jsonb;
begin
  perform private.export_job_state(p_id); -- owner, live membership/scope/MFA/expiry/policy, including before reads
  select * into v_job from private.export_jobs where id=p_id;
  if v_job.status not in ('queued','running','complete') then raise exception using errcode='42501',message='export no longer available'; end if;
  if v_job.scope->>'kind'='personal' and exists(select 1 from private.persons where tree_id=v_job.tree_id
    and id=(v_job.scope->>'personId')::uuid and protected_minor) then
    raise exception using errcode='42501',message='verified representative policy required'; end if;

  with selected as materialized (
    select p.* from private.persons p where p.tree_id=v_job.tree_id and p.deleted_at is null and not p.protected_minor
      and (v_job.scope->>'kind'<>'branch' or p.primary_branch_id=(v_job.scope->>'branchId')::uuid)
      and (v_job.scope->>'kind'<>'personal' or p.id=(v_job.scope->>'personId')::uuid)
      -- Public publishing workflow M02-04 is not yet wired: fail closed rather than equating visibility with approval.
      and v_job.audience<>'public'
      and (v_job.audience='self' or (p.visibility in ('public','members')
        and (p.life_status='deceased' or private.export_field_consent(p.tree_id,p.id,'identity'))))
  ), projected_facts as materialized (
    select f.* from private.person_facts f join selected p on p.tree_id=f.tree_id and p.id=f.person_id
    where v_job.audience='self' or (f.visibility in ('public','members')
      and (p.life_status='deceased' or private.export_field_consent(p.tree_id,p.id,'facts:'||f.kind)))
  ), readable_sources as materialized (
    select s.id,s.title from private.sources s where s.tree_id=v_job.tree_id and s.visibility in ('public','members')
      and private.has_capability(s.tree_id,'source.read',null)
  ), links as materialized (
    select l.* from private.parent_links l join selected p on p.id=l.parent_id and p.tree_id=l.tree_id
      join selected c on c.id=l.child_id and c.tree_id=l.tree_id join readable_sources s on s.id=l.source_id
    where l.deleted_at is null and v_job.audience<>'self'
      and (p.life_status='deceased' or private.export_field_consent(p.tree_id,p.id,'relationships'))
      and (c.life_status='deceased' or private.export_field_consent(c.tree_id,c.id,'relationships'))
  ), unions as materialized (
    select u.* from private.unions u where u.tree_id=v_job.tree_id and v_job.audience<>'self'
      and exists(select 1 from private.union_partners up where up.tree_id=u.tree_id and up.union_id=u.id)
      and not exists(select 1 from private.union_partners up left join selected p on p.tree_id=up.tree_id and p.id=up.person_id
        where up.tree_id=u.tree_id and up.union_id=u.id and (p.id is null or (p.life_status<>'deceased' and not private.export_field_consent(p.tree_id,p.id,'relationships'))))
      and not exists(select 1 from private.union_children uc left join selected p on p.tree_id=uc.tree_id and p.id=uc.person_id
        where uc.tree_id=u.tree_id and uc.union_id=u.id and (p.id is null or (p.life_status<>'deceased' and not private.export_field_consent(p.tree_id,p.id,'relationships'))))
  ), citations as materialized (
    select c.* from private.citations c join readable_sources s on s.id=c.source_id where c.tree_id=v_job.tree_id
      and (exists(select 1 from selected p where p.id=c.person_id) or exists(select 1 from projected_facts f where f.id=c.fact_id)
        or exists(select 1 from links l where l.id=c.parent_link_id) or exists(select 1 from unions u where u.id=c.union_id))
  )
  select jsonb_build_object('schemaVersion','phan-export/1','treeId',v_job.tree_id,'policyVersion',v_job.policy_version,
    'generatedAt',clock_timestamp(),'isDemo',true,'scope',v_job.scope,
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'code',p.code,'displayName',p.display_name,
      'names',coalesce((select jsonb_agg(jsonb_build_object('name',n.name,'kind',n.kind) order by n.is_preferred desc,n.id)
        from private.person_names n where n.tree_id=p.tree_id and n.person_id=p.id
          and (v_job.audience='self' or p.life_status='deceased' or private.export_field_consent(p.tree_id,p.id,'names'))),'[]'::jsonb),
      'recordedSex',case when v_job.audience='self' or p.life_status='deceased' or private.export_field_consent(p.tree_id,p.id,'sex') then p.recorded_sex else null end,
      'lifeStatus',case when v_job.audience='self' or p.life_status='deceased' or private.export_field_consent(p.tree_id,p.id,'life_status') then p.life_status else null end,
      'facts',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'kind',f.kind,'valueDate',f.value_date,'valueText',f.value_text,'confidence',f.confidence) order by f.id)
        from projected_facts f where f.person_id=p.id),'[]'::jsonb)) order by p.id) from selected p),'[]'::jsonb),
    'parentLinks',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'parentId',l.parent_id,'childId',l.child_id,'kind',l.kind,'status',l.status) order by l.id) from links l),'[]'::jsonb),
    'unions',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'kind',u.kind,'status',u.status,
      'partnerIds',(select jsonb_agg(up.person_id order by up.ordinal,up.id) from private.union_partners up where up.tree_id=u.tree_id and up.union_id=u.id),
      'childIds',coalesce((select jsonb_agg(uc.person_id order by uc.ordinal,uc.id) from private.union_children uc where uc.tree_id=u.tree_id and uc.union_id=u.id),'[]'::jsonb)) order by u.id) from unions u),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title) order by s.id) from readable_sources s where exists(select 1 from citations c where c.source_id=s.id)),'[]'::jsonb),
    'citations',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'sourceId',c.source_id,
      'targetKind',case when c.person_id is not null then 'person' when c.fact_id is not null then 'fact' when c.union_id is not null then 'union' else 'parent_link' end,
      'targetId',coalesce(c.person_id,c.fact_id,c.union_id,c.parent_link_id),'locator',c.locator) order by c.id) from citations c),'[]'::jsonb)) into v_result;
  if jsonb_array_length(v_result->'people')>10000 or jsonb_array_length(v_result->'parentLinks')>20000
    or jsonb_array_length(v_result->'unions')>10000 or jsonb_array_length(v_result->'citations')>50000 then
    raise exception using errcode='54000',message='export projection capacity exceeded'; end if;
  return v_result;
end $$;
create function api.export_projection(p_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.export_projection(p_id); $$;
revoke all on function private.export_field_consent(uuid,uuid,text) from public,anon,authenticated;
revoke all on function private.export_projection(uuid),api.export_projection(uuid) from public,anon,authenticated;
grant execute on function private.export_projection(uuid),api.export_projection(uuid) to authenticated;
commit;
