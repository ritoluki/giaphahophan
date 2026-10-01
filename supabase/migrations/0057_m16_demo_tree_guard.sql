-- M16 safety: a client cannot opt a real-data tree into the demo import path.
begin;

create or replace function private.import_require_demo_tree(p_tree_id uuid)
returns uuid language plpgsql volatile security definer
set search_path=pg_catalog,private
as $$
declare v_mode text;
begin
  select t.data_mode into v_mode from private.trees t where t.id=p_tree_id for share;
  if v_mode is distinct from 'demo' then
    raise exception using errcode='42501',message='imports are restricted to demo-mode trees';
  end if;
  return p_tree_id;
end;
$$;

create or replace function private.import_require_demo_job(p_job_id uuid)
returns uuid language plpgsql volatile security definer
set search_path=pg_catalog,private
as $$
declare v_tree_id uuid;
begin
  select j.tree_id into v_tree_id from private.import_jobs j
  where j.id=p_job_id and private.has_capability(j.tree_id,'imports.manage',null);
  if v_tree_id is null then raise exception using errcode='42501',message='import job is unavailable'; end if;
  return private.import_require_demo_tree(v_tree_id);
end;
$$;

create or replace function private.import_require_demo_asset(p_asset_id uuid)
returns uuid language plpgsql volatile security definer
set search_path=pg_catalog,private
as $$
declare v_tree_id uuid;
begin
  select m.tree_id into v_tree_id from private.media_assets m
  where m.id=p_asset_id and m.purpose='import'
    and private.has_capability(m.tree_id,'imports.manage',null);
  if v_tree_id is null then raise exception using errcode='P0002',message='ready import source not found'; end if;
  return private.import_require_demo_tree(v_tree_id);
end;
$$;

create or replace function private.import_demo_mode_guard()
returns trigger language plpgsql security definer
set search_path=pg_catalog,private
as $$
begin
  perform private.import_require_demo_tree(new.tree_id);
  if new.manifest->>'mode' is distinct from 'demo' then
    raise exception using errcode='42501',message='import job mode must be demo';
  end if;
  return new;
end;
$$;

drop trigger if exists import_jobs_demo_mode_guard on private.import_jobs;
create trigger import_jobs_demo_mode_guard
before insert or update on private.import_jobs
for each row execute function private.import_demo_mode_guard();

create or replace function private.import_rows_demo_mode_guard()
returns trigger language plpgsql security definer
set search_path=pg_catalog,private
as $$
begin
  perform private.import_require_demo_tree(new.tree_id);
  if not exists(select 1 from private.import_jobs j where j.id=new.job_id and j.tree_id=new.tree_id and j.manifest->>'mode'='demo') then
    raise exception using errcode='42501',message='staging rows require a demo-mode import job';
  end if;
  return new;
end;
$$;

drop trigger if exists import_rows_demo_mode_guard on private.import_rows;
create trigger import_rows_demo_mode_guard
before insert or update on private.import_rows
for each row execute function private.import_rows_demo_mode_guard();

create or replace function private.import_storage_select_allowed(p_name text)
returns boolean language sql stable security definer set search_path=pg_catalog,private
as $$
  select exists (
    select 1 from private.media_assets m join private.trees t on t.id=m.tree_id
    where m.object_path=p_name and m.purpose='import' and m.state='ready'
      and m.actual_sha256=m.expected_sha256 and t.data_mode='demo'
      and private.has_capability(m.tree_id,'imports.manage',null)
  );
$$;

create or replace function private.import_tree_list()
returns table(id uuid,name text)
language sql stable security definer set search_path=pg_catalog,private
as $$
  select t.id,t.name from private.trees t
  where t.data_mode='demo' and private.has_capability(t.id,'imports.manage',null)
  order by t.created_at,t.id
$$;

create or replace function api.import_create(p_tree_id uuid,p_asset_id uuid,p_format text,
  p_source_namespace text,p_mapping_version text,p_mode text,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,status text,tree_id uuid,source_asset_id uuid,file_sha256 text,
  format text,source_namespace text,mapping_version text,classification text,counters jsonb,warnings jsonb)
language plpgsql security invoker set search_path=pg_catalog
as $$
begin
  perform private.import_require_demo_tree(p_tree_id);
  return query select * from private.import_create(p_tree_id,p_asset_id,p_format,
    p_source_namespace,p_mapping_version,p_mode,p_idempotency_key,p_request_hash);
end;
$$;

create or replace function api.import_source_context(p_asset_id uuid)
returns table(id uuid,tree_id uuid,object_path text,mime_type text,size_bytes bigint,sha256 text)
language plpgsql security invoker set search_path=pg_catalog
as $$
begin
  perform private.import_require_demo_asset(p_asset_id);
  return query select * from private.import_source_context(p_asset_id);
end;
$$;

create or replace function api.import_stage_rows(p_job_id uuid,p_rows jsonb,p_warnings jsonb)
returns table(id uuid,version bigint,status text,valid bigint,invalid bigint,possible_duplicates bigint,snapshot_hash text)
language plpgsql security invoker set search_path=pg_catalog
as $$
begin
  perform private.import_require_demo_job(p_job_id);
  return query select * from private.import_stage_rows(p_job_id,p_rows,p_warnings);
end;
$$;

create or replace function api.import_preview(p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog
as $$
begin
  perform private.import_require_demo_job(p_job_id);
  return private.import_preview(p_job_id);
end;
$$;

create or replace function api.import_mapping_attach(p_job_id uuid,p_mapping jsonb)
returns table(job_id uuid,version bigint)
language plpgsql security invoker set search_path=pg_catalog
as $$
begin
  perform private.import_require_demo_job(p_job_id);
  return query select * from private.import_mapping_attach(p_job_id,p_mapping);
end;
$$;

revoke all on function private.import_require_demo_tree(uuid) from public,anon,authenticated;
grant execute on function private.import_require_demo_tree(uuid) to authenticated;
revoke all on function private.import_require_demo_job(uuid) from public,anon,authenticated;
grant execute on function private.import_require_demo_job(uuid) to authenticated;
revoke all on function private.import_require_demo_asset(uuid) from public,anon,authenticated;
grant execute on function private.import_require_demo_asset(uuid) to authenticated;
revoke all on function private.import_demo_mode_guard() from public,anon,authenticated;
revoke all on function private.import_rows_demo_mode_guard() from public,anon,authenticated;

commit;
