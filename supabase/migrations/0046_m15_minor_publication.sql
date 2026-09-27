-- M15-02: minor safeguards and independent approved-story publication.
begin;

alter table private.scholarship_applications
  add column if not exists minor_status text not null default 'unknown' check (minor_status in ('unknown', 'adult', 'minor')),
  add column if not exists guardian_status text not null default 'pending' check (guardian_status in ('not_required', 'pending', 'verified', 'withdrawn')),
  add column if not exists guardian_proof_asset_id uuid,
  add column if not exists guardian_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists guardian_verified_at timestamptz,
  add constraint scholarship_guardian_proof_same_tree_fk foreign key (tree_id, guardian_proof_asset_id) references private.media_assets(tree_id, id);

create table private.scholarship_publications (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  submitted_by uuid not null references auth.users(id),
  application_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 500),
  story text not null check (length(btrim(story)) between 1 and 20000),
  source_asset_id uuid not null,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'needs_info', 'approved', 'rejected', 'withdrawn')),
  published_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  unique (tree_id, id),
  unique (tree_id, application_id),
  foreign key (tree_id, application_id) references private.scholarship_applications(tree_id, id),
  foreign key (tree_id, source_asset_id) references private.media_assets(tree_id, id)
);

create index scholarship_publications_tree_status_idx on private.scholarship_publications(tree_id, status, published_at desc);
drop trigger if exists touch_scholarship_publications on private.scholarship_publications;
create trigger touch_scholarship_publications before update on private.scholarship_publications
for each row execute function private.touch_updated_at();
alter table private.scholarship_publications enable row level security;
alter table private.scholarship_publications force row level security;

create or replace function private.scholarship_application_safeguard_set_idempotent(
  p_application_id uuid, p_minor_status text, p_guardian_status text, p_guardian_proof_asset_id uuid,
  p_reason text, p_base_version bigint, p_idempotency_key uuid, p_request_hash text
)
returns table(application_id uuid, version bigint, minor_status text, guardian_status text, guardian_proof_asset_id uuid, guardian_verified_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare v_actor uuid := auth.uid(); v_app private.scholarship_applications%rowtype; v_existing private.idempotency_records%rowtype; v_updated private.scholarship_applications%rowtype; v_inserted integer;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if not private.has_mfa() then raise exception using errcode = '42501', message = 'minor safeguard changes require aal2'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then raise exception using errcode = '22023', message = 'idempotency key and request hash are required'; end if;
  if p_minor_status not in ('unknown','adult','minor') or p_guardian_status not in ('not_required','pending','verified','withdrawn') then raise exception using errcode = '22023', message = 'unsupported safeguard status'; end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 4000 then raise exception using errcode = '22023', message = 'safeguard reason is required'; end if;
  select * into v_app from private.scholarship_applications a where a.id = p_application_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'scholarship application not found'; end if;
  if not private.has_capability(v_app.tree_id, 'scholarship.review', null) and not private.has_capability(v_app.tree_id, 'scholarship.manage', null) then raise exception using errcode = '42501', message = 'scholarship review capability required'; end if;
  if v_app.submitted_by = v_actor then raise exception using errcode = '42501', message = 'submitter cannot verify own guardian safeguard'; end if;
  if p_base_version <> v_app.version then raise exception using errcode = 'P0009', message = 'application version is stale'; end if;
  if p_minor_status = 'minor' and p_guardian_status <> 'verified' then raise exception using errcode = '42501', message = 'minor requires verified guardian safeguard'; end if;
  if p_minor_status = 'adult' and (p_guardian_status <> 'not_required' or p_guardian_proof_asset_id is not null) then raise exception using errcode = '22023', message = 'adult safeguard cannot carry guardian proof'; end if;
  if p_minor_status <> 'minor' and p_guardian_proof_asset_id is not null then raise exception using errcode = '22023', message = 'guardian proof is only valid for minor status'; end if;
  if p_guardian_status = 'verified' and not exists (select 1 from private.media_assets m where m.tree_id = v_app.tree_id and m.id = p_guardian_proof_asset_id and m.purpose = 'scholarship' and m.visibility = 'restricted' and m.state = 'ready') then raise exception using errcode = '42501', message = 'ready restricted guardian proof is required'; end if;

  delete from private.idempotency_records r where r.tree_id = v_app.tree_id and r.actor_id = v_actor and r.operation = 'scholarship.application.safeguard' and r.idempotency_key = p_idempotency_key and r.expires_at <= clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,expires_at) values(v_app.tree_id,v_actor,'scholarship.application.safeguard',p_idempotency_key,p_request_hash,clock_timestamp()+interval '24 hours') on conflict (tree_id,actor_id,operation,idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id=v_app.tree_id and r.actor_id=v_actor and r.operation='scholarship.application.safeguard' and r.idempotency_key=p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'applicationId')::uuid,(v_existing.response->>'version')::bigint,v_existing.response->>'minorStatus',v_existing.response->>'guardianStatus',(v_existing.response->>'guardianProofAssetId')::uuid,(v_existing.response->>'verifiedAt')::timestamptz;
    return;
  end if;
  update private.scholarship_applications a set minor_status=p_minor_status, guardian_status=p_guardian_status, guardian_proof_asset_id=p_guardian_proof_asset_id, guardian_verified_by=case when p_guardian_status='verified' then v_actor else null end, guardian_verified_at=case when p_guardian_status='verified' then clock_timestamp() else null end, updated_at=clock_timestamp() where a.id=v_app.id and a.version=p_base_version returning * into v_updated;
  if not found then raise exception using errcode = 'P0009', message = 'application version is stale'; end if;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary,metadata) values(v_updated.tree_id,v_actor,'scholarship.application.safeguard.updated','scholarship_application',v_updated.id,gen_random_uuid(),'Minor/guardian safeguard updated; proof content remains private',jsonb_build_object('minorStatus',p_minor_status,'guardianStatus',p_guardian_status));
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by) values(v_updated.tree_id,'scholarship.application.safeguard.updated',v_updated.id,v_updated.version,'scholarship.application.safeguard.updated:'||v_updated.id::text||':'||v_updated.version::text,v_actor);
  update private.idempotency_records r set response=jsonb_build_object('applicationId',v_updated.id,'version',v_updated.version,'minorStatus',v_updated.minor_status,'guardianStatus',v_updated.guardian_status,'guardianProofAssetId',v_updated.guardian_proof_asset_id,'verifiedAt',v_updated.guardian_verified_at) where r.tree_id=v_updated.tree_id and r.actor_id=v_actor and r.operation='scholarship.application.safeguard' and r.idempotency_key=p_idempotency_key;
  return query select v_updated.id,v_updated.version,v_updated.minor_status,v_updated.guardian_status,v_updated.guardian_proof_asset_id,v_updated.guardian_verified_at;
end;
$$;

create or replace function private.scholarship_publication_create_idempotent(p_application_id uuid,p_title text,p_story text,p_source_asset_id uuid,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,application_id uuid,title text,story text,source_asset_id uuid,status text,published_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare v_actor uuid:=auth.uid(); v_app private.scholarship_applications%rowtype; v_existing private.idempotency_records%rowtype; v_pub private.scholarship_publications%rowtype; v_inserted integer;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash),'') is null then raise exception using errcode='22023',message='idempotency key and request hash are required'; end if;
  if nullif(btrim(p_title),'') is null or length(p_title)>500 or nullif(btrim(p_story),'') is null or length(p_story)>20000 then raise exception using errcode='22023',message='publication title/story is invalid'; end if;
  select * into v_app from private.scholarship_applications a where a.id=p_application_id;
  if not found then raise exception using errcode='P0002',message='scholarship application not found'; end if;
  if not private.is_active_member(v_app.tree_id) then raise exception using errcode='42501',message='active tree membership required'; end if;
  if v_app.status <> 'approved' then raise exception using errcode='P0003',message='only approved applications can request publication'; end if;
  if v_app.submitted_by <> v_actor and not private.has_capability(v_app.tree_id,'scholarship.review',null) and not private.has_capability(v_app.tree_id,'scholarship.manage',null) then raise exception using errcode='42501',message='publication submit capability required'; end if;
  if v_app.minor_status='unknown' or (v_app.minor_status='minor' and v_app.guardian_status <> 'verified') or (v_app.minor_status='adult' and v_app.guardian_status <> 'not_required') then raise exception using errcode='42501',message='candidate safeguard is not ready for publication'; end if;
  if not exists(select 1 from private.media_assets m where m.tree_id=v_app.tree_id and m.id=p_source_asset_id and m.purpose in ('source','scholarship') and m.visibility='restricted' and m.state='ready') then raise exception using errcode='42501',message='ready restricted publication source is required'; end if;
  delete from private.idempotency_records r where r.tree_id=v_app.tree_id and r.actor_id=v_actor and r.operation='scholarship.publication.create' and r.idempotency_key=p_idempotency_key and r.expires_at<=clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,expires_at) values(v_app.tree_id,v_actor,'scholarship.publication.create',p_idempotency_key,p_request_hash,clock_timestamp()+interval '24 hours') on conflict(tree_id,actor_id,operation,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id=v_app.tree_id and r.actor_id=v_actor and r.operation='scholarship.publication.create' and r.idempotency_key=p_idempotency_key for update;
  if v_inserted=0 then
    if v_existing.request_hash<>p_request_hash then raise exception using errcode='P0008',message='idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode='P0008',message='idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid,(v_existing.response->>'version')::bigint,(v_existing.response->>'applicationId')::uuid,v_existing.response->>'title',v_existing.response->>'story',(v_existing.response->>'sourceAssetId')::uuid,v_existing.response->>'status',(v_existing.response->>'publishedAt')::timestamptz; return;
  end if;
  insert into private.scholarship_publications(tree_id,created_by,submitted_by,application_id,title,story,source_asset_id,status) values(v_app.tree_id,v_actor,v_actor,v_app.id,btrim(p_title),btrim(p_story),p_source_asset_id,'submitted') returning * into v_pub;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary,metadata) values(v_pub.tree_id,v_actor,'scholarship.publication.submitted','scholarship_publication',v_pub.id,gen_random_uuid(),'Story publication request submitted; candidate identity and source remain private',jsonb_build_object('applicationId',v_app.id));
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by) values(v_pub.tree_id,'scholarship.publication.submitted',v_pub.id,v_pub.version,'scholarship.publication.submitted:'||v_pub.id::text||':'||v_pub.version::text,v_actor);
  update private.idempotency_records r set response=jsonb_build_object('id',v_pub.id,'version',v_pub.version,'applicationId',v_pub.application_id,'title',v_pub.title,'story',v_pub.story,'sourceAssetId',v_pub.source_asset_id,'status',v_pub.status,'publishedAt',v_pub.published_at) where r.tree_id=v_pub.tree_id and r.actor_id=v_actor and r.operation='scholarship.publication.create' and r.idempotency_key=p_idempotency_key;
  return query select v_pub.id,v_pub.version,v_pub.application_id,v_pub.title,v_pub.story,v_pub.source_asset_id,v_pub.status,v_pub.published_at;
end;
$$;

create or replace function private.scholarship_publication_list_authorized(p_application_id uuid)
returns table(id uuid,version bigint,application_id uuid,title text,story text,source_asset_id uuid,status text,published_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,private
as $$
declare v_tree_id uuid; v_actor uuid:=auth.uid();
begin
  select p.tree_id into v_tree_id from private.scholarship_publications p where p.application_id=p_application_id;
  if v_tree_id is null then raise exception using errcode='P0002',message='scholarship publication not found'; end if;
  if v_actor is null or not private.is_active_member(v_tree_id) then raise exception using errcode='42501',message='active tree membership required'; end if;
  return query select p.id,p.version,p.application_id,p.title,p.story,p.source_asset_id,p.status,p.published_at from private.scholarship_publications p where p.application_id=p_application_id and (p.submitted_by=v_actor or private.has_capability(v_tree_id,'scholarship.review',null) or private.has_capability(v_tree_id,'scholarship.manage',null));
end;
$$;

create or replace function private.scholarship_publication_review_idempotent(p_publication_id uuid,p_decision text,p_reason text,p_base_version bigint,p_reviewed_snapshot_hash text,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,application_id uuid,title text,story text,source_asset_id uuid,status text,published_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,private
as $$
declare v_actor uuid:=auth.uid(); v_pub private.scholarship_publications%rowtype; v_app private.scholarship_applications%rowtype; v_existing private.idempotency_records%rowtype; v_updated private.scholarship_publications%rowtype; v_inserted integer; v_next_status text;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if not private.has_mfa() then raise exception using errcode='42501',message='publication review requires aal2'; end if;
  if p_decision not in ('approve','reject','needs_info') or nullif(btrim(p_reason),'') is null or nullif(btrim(p_reviewed_snapshot_hash),'') is null then raise exception using errcode='22023',message='publication review input is invalid'; end if;
  select * into v_pub from private.scholarship_publications p where p.id=p_publication_id for update;
  if not found then raise exception using errcode='P0002',message='scholarship publication not found'; end if;
  if not private.has_capability(v_pub.tree_id,'scholarship.review',null) and not private.has_capability(v_pub.tree_id,'scholarship.manage',null) then raise exception using errcode='42501',message='scholarship review capability required'; end if;
  if v_pub.submitted_by=v_actor then raise exception using errcode='42501',message='submitter cannot review own publication'; end if;
  select * into v_app from private.scholarship_applications a where a.id=v_pub.application_id;
  if v_pub.status not in ('submitted','needs_info') or p_base_version<>v_pub.version then raise exception using errcode='P0009',message='publication version is stale or not reviewable'; end if;
  if p_decision='approve' and (v_app.minor_status='unknown' or (v_app.minor_status='minor' and v_app.guardian_status<>'verified') or (v_app.minor_status='adult' and v_app.guardian_status<>'not_required')) then raise exception using errcode='42501',message='candidate safeguard is not ready for publication'; end if;
  v_next_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'needs_info' end;
  delete from private.idempotency_records r where r.tree_id=v_pub.tree_id and r.actor_id=v_actor and r.operation='scholarship.publication.review' and r.idempotency_key=p_idempotency_key and r.expires_at<=clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,expires_at) values(v_pub.tree_id,v_actor,'scholarship.publication.review',p_idempotency_key,p_request_hash,clock_timestamp()+interval '24 hours') on conflict(tree_id,actor_id,operation,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id=v_pub.tree_id and r.actor_id=v_actor and r.operation='scholarship.publication.review' and r.idempotency_key=p_idempotency_key for update;
  if v_inserted=0 then
    if v_existing.request_hash<>p_request_hash then raise exception using errcode='P0008',message='idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode='P0008',message='idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid,(v_existing.response->>'version')::bigint,(v_existing.response->>'applicationId')::uuid,v_existing.response->>'title',v_existing.response->>'story',(v_existing.response->>'sourceAssetId')::uuid,v_existing.response->>'status',(v_existing.response->>'publishedAt')::timestamptz; return;
  end if;
  update private.scholarship_publications p set status=v_next_status, approved_by=case when v_next_status='approved' then v_actor else null end, published_at=case when v_next_status='approved' then clock_timestamp() else null end, updated_at=clock_timestamp() where p.id=v_pub.id and p.version=p_base_version returning * into v_updated;
  if not found then raise exception using errcode='P0009',message='publication version is stale'; end if;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary,metadata) values(v_updated.tree_id,v_actor,'scholarship.publication.reviewed','scholarship_publication',v_updated.id,gen_random_uuid(),'Story publication reviewed separately from award approval',jsonb_build_object('decision',p_decision,'status',v_next_status,'reviewedSnapshotHash',p_reviewed_snapshot_hash));
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by) values(v_updated.tree_id,'scholarship.publication.reviewed',v_updated.id,v_updated.version,'scholarship.publication.reviewed:'||v_updated.id::text||':'||v_updated.version::text,v_actor);
  update private.idempotency_records r set response=jsonb_build_object('id',v_updated.id,'version',v_updated.version,'applicationId',v_updated.application_id,'title',v_updated.title,'story',v_updated.story,'sourceAssetId',v_updated.source_asset_id,'status',v_updated.status,'publishedAt',v_updated.published_at) where r.tree_id=v_updated.tree_id and r.actor_id=v_actor and r.operation='scholarship.publication.review' and r.idempotency_key=p_idempotency_key;
  return query select v_updated.id,v_updated.version,v_updated.application_id,v_updated.title,v_updated.story,v_updated.source_asset_id,v_updated.status,v_updated.published_at;
end;
$$;

create or replace function private.scholarship_stories_authorized(p_tree_id uuid)
returns table(id uuid,version bigint,title text,story text,published_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,private
as $$
begin
  if auth.uid() is null or not private.is_active_member(p_tree_id) then raise exception using errcode='42501',message='active tree membership required'; end if;
  return query select p.id,p.version,p.title,p.story,p.published_at from private.scholarship_publications p join private.scholarship_applications a on a.tree_id=p.tree_id and a.id=p.application_id where p.tree_id=p_tree_id and p.status='approved' and p.published_at is not null and ((a.minor_status='minor' and a.guardian_status='verified') or (a.minor_status='adult' and a.guardian_status='not_required')) order by p.published_at desc,p.id;
end;
$$;

create or replace function api.scholarship_application_safeguard_set(p_application_id uuid,p_minor_status text,p_guardian_status text,p_guardian_proof_asset_id uuid,p_reason text,p_base_version bigint,p_idempotency_key uuid,p_request_hash text)
returns table(application_id uuid,version bigint,minor_status text,guardian_status text,guardian_proof_asset_id uuid,guardian_verified_at timestamptz) language sql security invoker set search_path=pg_catalog,private as $$ select * from private.scholarship_application_safeguard_set_idempotent($1,$2,$3,$4,$5,$6,$7,$8); $$;
create or replace function api.scholarship_publication_create(p_application_id uuid,p_title text,p_story text,p_source_asset_id uuid,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,application_id uuid,title text,story text,source_asset_id uuid,status text,published_at timestamptz) language sql security invoker set search_path=pg_catalog,private as $$ select * from private.scholarship_publication_create_idempotent($1,$2,$3,$4,$5,$6); $$;
create or replace function api.scholarship_publication_list(p_application_id uuid)
returns table(id uuid,version bigint,application_id uuid,title text,story text,source_asset_id uuid,status text,published_at timestamptz) language sql stable security invoker set search_path=pg_catalog,private as $$ select * from private.scholarship_publication_list_authorized($1); $$;
create or replace function api.scholarship_publication_review(p_publication_id uuid,p_decision text,p_reason text,p_base_version bigint,p_reviewed_snapshot_hash text,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,application_id uuid,title text,story text,source_asset_id uuid,status text,published_at timestamptz) language sql security invoker set search_path=pg_catalog,private as $$ select * from private.scholarship_publication_review_idempotent($1,$2,$3,$4,$5,$6,$7); $$;
create or replace function api.scholarship_stories(p_tree_id uuid)
returns table(id uuid,version bigint,title text,story text,published_at timestamptz) language sql stable security invoker set search_path=pg_catalog,private as $$ select * from private.scholarship_stories_authorized($1); $$;

revoke all on table private.scholarship_publications from public,anon,authenticated;
revoke all on function private.scholarship_application_safeguard_set_idempotent(uuid,text,text,uuid,text,bigint,uuid,text),private.scholarship_publication_create_idempotent(uuid,text,text,uuid,uuid,text),private.scholarship_publication_list_authorized(uuid),private.scholarship_publication_review_idempotent(uuid,text,text,bigint,text,uuid,text),private.scholarship_stories_authorized(uuid) from public,anon,authenticated;
grant execute on function private.scholarship_application_safeguard_set_idempotent(uuid,text,text,uuid,text,bigint,uuid,text),private.scholarship_publication_create_idempotent(uuid,text,text,uuid,uuid,text),private.scholarship_publication_list_authorized(uuid),private.scholarship_publication_review_idempotent(uuid,text,text,bigint,text,uuid,text),private.scholarship_stories_authorized(uuid) to authenticated;
grant execute on function api.scholarship_application_safeguard_set(uuid,text,text,uuid,text,bigint,uuid,text),api.scholarship_publication_create(uuid,text,text,uuid,uuid,text),api.scholarship_publication_list(uuid),api.scholarship_publication_review(uuid,text,text,bigint,text,uuid,text),api.scholarship_stories(uuid) to authenticated;

commit;