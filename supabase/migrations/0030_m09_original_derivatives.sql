begin;

alter table private.media_assets
  add column if not exists derivatives jsonb not null default '{}'::jsonb;

create or replace function private.prevent_media_original_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
begin
  if new.object_path is distinct from old.object_path
     or new.expected_sha256 is distinct from old.expected_sha256
     or (old.actual_sha256 is not null and new.actual_sha256 is distinct from old.actual_sha256) then
    raise exception using errcode = '40001', message = 'media original identity is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_media_original on private.media_assets;
create trigger protect_media_original
before update on private.media_assets
for each row execute function private.prevent_media_original_mutation();

create or replace function private.media_asset_processing_start(p_asset_id uuid)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text, alt_text text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_actor uuid := auth.uid();
begin
  update private.media_assets
  set state = 'processing'
  where media_assets.id = p_asset_id and media_assets.created_by = v_actor and media_assets.state = 'ready';
  if not found then
    if not exists (select 1 from private.media_assets where media_assets.id = p_asset_id
      and media_assets.created_by = v_actor and media_assets.state = 'processing') then
      raise exception using errcode = '42501', message = 'media derivative processing is not allowed';
    end if;
  end if;
  return query select m.id, m.version, m.state, coalesce(m.mime_type, m.declared_mime),
    coalesce(m.actual_size_bytes, m.size_bytes), m.visibility, m.alt_text
  from private.media_assets m where m.id = p_asset_id and m.created_by = v_actor;
end;
$$;

create or replace function private.media_asset_derivatives_failed(p_asset_id uuid, p_reason text)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text, alt_text text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_actor uuid := auth.uid();
begin
  update private.media_assets set state = 'failed', scan_code = left(coalesce(p_reason, 'DERIVATIVE_FAILED'), 120)
  where media_assets.id = p_asset_id and media_assets.created_by = v_actor and media_assets.state = 'processing';
  if not found then raise exception using errcode = '42501', message = 'media derivative failure is not allowed'; end if;
  return query select m.id, m.version, m.state, coalesce(m.mime_type, m.declared_mime),
    coalesce(m.actual_size_bytes, m.size_bytes), m.visibility, m.alt_text
  from private.media_assets m where m.id = p_asset_id;
end;
$$;
create or replace function private.media_asset_derivatives_commit(p_asset_id uuid, p_manifest jsonb)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text, alt_text text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_asset private.media_assets%rowtype;
begin
  select * into v_asset from private.media_assets
  where media_assets.id = p_asset_id and media_assets.created_by = v_actor for update;
  if not found then raise exception using errcode = '42501', message = 'media derivative commit is not allowed'; end if;
  if v_asset.state not in ('processing','ready') then
    raise exception using errcode = 'P0001', message = 'media asset is not processing';
  end if;
  if jsonb_typeof(p_manifest) <> 'object' or p_manifest = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'media derivative manifest is invalid';
  end if;
  if exists (select 1 from jsonb_object_keys(p_manifest) as k(key)
    where k.key not in ('320','640','1280','1920')) then
    raise exception using errcode = '22023', message = 'media derivative variant is invalid';
  end if;
  if exists (select 1 from jsonb_each(p_manifest) as e(key, value)
    where jsonb_typeof(e.value) <> 'object'
      or e.value->>'objectPath' <> v_asset.created_by::text || '/' || v_asset.id::text || '/derivatives/' || e.key || '.webp'
      or e.value->>'mimeType' <> 'image/webp'
      or not ((e.value->>'sizeBytes') ~ '^[1-9][0-9]*$')
      or case when (e.value->>'sizeBytes') ~ '^[1-9][0-9]*$' then (e.value->>'sizeBytes')::bigint <= 0 else false end) then
    raise exception using errcode = '22023', message = 'media derivative manifest failed validation';
  end if;
  update private.media_assets set derivatives = p_manifest, state = 'ready'
  where media_assets.id = p_asset_id;
  return query select m.id, m.version, m.state, coalesce(m.mime_type, m.declared_mime),
    coalesce(m.actual_size_bytes, m.size_bytes), m.visibility, m.alt_text
  from private.media_assets m where m.id = p_asset_id;
end;
$$;

create or replace function private.media_asset_owner_access(p_asset_id uuid)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text, alt_text text)
language sql stable security definer set search_path = pg_catalog as $$
  select m.id, m.version, m.state, coalesce(m.mime_type, m.declared_mime),
    coalesce(m.actual_size_bytes, m.size_bytes), m.visibility, m.alt_text
  from private.media_assets m
  where m.id = p_asset_id and m.created_by = auth.uid() and m.state = 'ready';
$$;

create or replace function private.media_storage_insert_allowed(p_name text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from private.media_assets m where m.created_by = auth.uid() and (
    (m.object_path = p_name and m.state in ('requested','uploading'))
    or (m.state = 'processing' and p_name ~ ('^' || m.created_by::text || '/' || m.id::text || '/derivatives/(320|640|1280|1920)\.webp$'))
  ));
$$;

create or replace function private.media_storage_select_allowed(p_name text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from private.media_assets m where (
    m.object_path = p_name
    or exists (select 1 from jsonb_each(m.derivatives) as d(variant, value) where d.value->>'objectPath' = p_name)
    or (m.state = 'processing' and p_name ~ ('^' || m.created_by::text || '/' || m.id::text || '/derivatives/(320|640|1280|1920)\.webp$'))
  ) and (
    m.created_by = auth.uid()
    or (m.state = 'ready' and (m.visibility = 'public' or private.has_capability(m.tree_id, 'media.read', null)))
  ));
$$;

drop policy if exists media_assets_update on storage.objects;
create policy media_assets_update on storage.objects for update to authenticated
using (bucket_id = 'family-assets' and private.media_storage_select_allowed(name))
with check (bucket_id = 'family-assets' and private.media_storage_insert_allowed(name));

create or replace function api.media_asset_processing_start(p_asset_id uuid)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text, alt_text text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_asset_processing_start($1);
$$;

create or replace function api.media_asset_derivatives_failed(p_asset_id uuid, p_reason text)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text, alt_text text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_asset_derivatives_failed($1, $2);
$$;

create or replace function api.media_asset_derivatives_commit(p_asset_id uuid, p_manifest jsonb)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text, alt_text text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_asset_derivatives_commit($1, $2);
$$;

create or replace function api.media_asset_owner_access(p_asset_id uuid)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text, alt_text text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_asset_owner_access($1);
$$;

revoke all on function private.prevent_media_original_mutation() from public, anon, authenticated;
revoke all on function private.media_asset_processing_start(uuid) from public, anon, authenticated;
revoke all on function private.media_asset_derivatives_commit(uuid,jsonb) from public, anon, authenticated;
revoke all on function private.media_asset_derivatives_failed(uuid,text) from public, anon, authenticated;
revoke all on function private.media_asset_owner_access(uuid) from public, anon, authenticated;
grant execute on function private.media_asset_processing_start(uuid) to authenticated;
grant execute on function private.media_asset_derivatives_commit(uuid,jsonb) to authenticated;
grant execute on function private.media_asset_derivatives_failed(uuid,text) to authenticated;
grant execute on function private.media_asset_owner_access(uuid) to authenticated;

revoke all on function api.media_asset_processing_start(uuid) from public, anon, authenticated;
revoke all on function api.media_asset_derivatives_commit(uuid,jsonb) from public, anon, authenticated;
revoke all on function api.media_asset_derivatives_failed(uuid,text) from public, anon, authenticated;
revoke all on function api.media_asset_owner_access(uuid) from public, anon, authenticated;
grant execute on function api.media_asset_processing_start(uuid) to authenticated;
grant execute on function api.media_asset_derivatives_commit(uuid,jsonb) to authenticated;
grant execute on function api.media_asset_derivatives_failed(uuid,text) to authenticated;
grant execute on function api.media_asset_owner_access(uuid) to authenticated;

commit;
