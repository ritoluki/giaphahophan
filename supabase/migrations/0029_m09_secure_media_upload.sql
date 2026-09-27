begin;

create table if not exists private.media_assets (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  filename text not null,
  declared_mime text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  actual_size_bytes bigint,
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  actual_sha256 text,
  purpose text not null check (purpose in ('portrait','source','album','import','receipt','scholarship')),
  visibility text not null check (visibility in ('restricted','members','public')),
  state text not null default 'requested' check (state in ('requested','uploading','uploaded','scanning','processing','ready','rejected','failed','quarantined')),
  object_path text not null unique,
  scan_code text,
  scan_completed_at timestamptz,
  alt_text text,
  constraint media_assets_filename_valid check (length(filename) between 1 and 255),
  constraint media_assets_sha256_consistent check (actual_sha256 is null or actual_sha256 ~ '^[a-f0-9]{64}$')
);

create index if not exists media_assets_tree_created_idx on private.media_assets (tree_id, created_at desc);
create index if not exists media_assets_actor_created_idx on private.media_assets (created_by, created_at desc);
create index if not exists media_assets_state_idx on private.media_assets (state);

drop trigger if exists touch_media_assets on private.media_assets;
create trigger touch_media_assets
before update on private.media_assets
for each row execute function private.touch_updated_at();

alter table private.media_assets enable row level security;
alter table private.media_assets force row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-assets',
  'family-assets',
  false,
  104857600,
  array['image/jpeg','image/png','image/webp','application/pdf','audio/mpeg','audio/mp4','video/mp4']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = clock_timestamp();

create or replace function private.media_validate_upload(
  p_mime text,
  p_size bigint,
  p_filename text,
  p_sha256 text,
  p_purpose text,
  p_visibility text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_limit bigint;
begin
  if p_mime not in ('image/jpeg','image/png','image/webp','application/pdf','audio/mpeg','audio/mp4','video/mp4') then
    raise exception using errcode = '22023', message = 'media MIME type is not allowed';
  end if;
  v_limit := case
    when p_mime in ('image/jpeg','image/png','image/webp') then 15728640
    when p_mime = 'application/pdf' then 26214400
    when p_mime in ('audio/mpeg','audio/mp4') then 52428800
    when p_mime = 'video/mp4' then 104857600
  end;
  if p_size is null or p_size < 1 or p_size > v_limit then
    raise exception using errcode = '22023', message = 'media size is outside the allowed limit';
  end if;
  if p_filename is null or length(p_filename) < 1 or length(p_filename) > 255
     or p_filename ~ '[[:cntrl:]]'
     or position('/' in p_filename) > 0
     or position(chr(92) in p_filename) > 0 then
    raise exception using errcode = '22023', message = 'media filename is invalid';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'media SHA-256 is invalid';
  end if;
  if p_purpose not in ('portrait','source','album','import','receipt','scholarship') then
    raise exception using errcode = '22023', message = 'media purpose is invalid';
  end if;
  if p_visibility not in ('restricted','members','public') then
    raise exception using errcode = '22023', message = 'media visibility is invalid';
  end if;
end;
$$;

drop function if exists api.media_upload_intent_idempotent(uuid,text,text,bigint,text,text,text,uuid,text);
drop function if exists api.media_upload_begin(uuid);
drop function if exists api.media_asset_upload_context(uuid);
drop function if exists api.media_asset_delete(uuid);
drop function if exists private.media_upload_begin(uuid);
drop function if exists private.media_asset_upload_context(uuid);
create or replace function private.media_upload_intent_authorized(
  p_tree_id uuid, p_filename text, p_mime text, p_size bigint, p_sha256 text,
  p_purpose text, p_visibility text
)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, object_path text, expires_at timestamptz)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_asset_id uuid;
  v_path text;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if not private.has_capability(p_tree_id, 'media.upload', null) then
    raise exception using errcode = '42501', message = 'media upload capability required';
  end if;
  perform private.media_validate_upload(p_mime, p_size, p_filename, p_sha256, p_purpose, p_visibility);
  if not exists (select 1 from private.trees as t where t.id = p_tree_id) then
    raise exception using errcode = 'P0002', message = 'tree not found';
  end if;
  if (select count(*) from private.media_assets as q where q.created_by = v_actor
      and q.created_at >= clock_timestamp() - interval '1 hour'
      and q.state not in ('rejected','failed','quarantined')) >= 20 then
    raise exception using errcode = 'P0004', message = 'media hourly quota exceeded';
  end if;
  if coalesce((select sum(q.size_bytes) from private.media_assets as q where q.created_by = v_actor
      and q.created_at >= date_trunc('day', timezone('Asia/Ho_Chi_Minh', clock_timestamp())) at time zone 'Asia/Ho_Chi_Minh'
      and q.state not in ('rejected','failed','quarantined')), 0) + p_size > 524288000 then
    raise exception using errcode = 'P0004', message = 'media daily quota exceeded';
  end if;

  v_asset_id := gen_random_uuid();
  v_path := v_actor::text || '/' || v_asset_id::text || '/original';
  insert into private.media_assets (
    id, tree_id, created_by, filename, declared_mime, size_bytes,
    expected_sha256, purpose, visibility, object_path
  ) values (
    v_asset_id, p_tree_id, v_actor, p_filename, p_mime, p_size,
    p_sha256, p_purpose, p_visibility, v_path
  );
  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id,
    redacted_summary, metadata)
  values (p_tree_id, v_actor, 'media.upload_requested', 'media', v_asset_id, gen_random_uuid(),
    'Media upload intent requested; filename and object path are redacted',
    jsonb_build_object('mimeType', p_mime, 'sizeBytes', p_size, 'purpose', p_purpose));

  return query select m.id, m.version, m.state, m.declared_mime, m.size_bytes, m.visibility,
    m.object_path, clock_timestamp() + interval '15 minutes'
  from private.media_assets m where m.id = v_asset_id;
end;
$$;

create or replace function private.media_upload_intent_idempotent(
  p_tree_id uuid, p_filename text, p_mime text, p_size bigint, p_sha256 text,
  p_purpose text, p_visibility text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, object_path text, expires_at timestamptz)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_existing private.idempotency_records%rowtype;
  v_result record;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if not private.has_capability(p_tree_id, 'media.upload', null) then
    raise exception using errcode = '42501', message = 'media upload capability required';
  end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;
  select * into v_existing from private.idempotency_records as r
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'media.upload_intent'
    and r.idempotency_key = p_idempotency_key and r.expires_at > clock_timestamp() for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response ->> 'id')::uuid, (v_existing.response ->> 'version')::bigint,
      v_existing.response ->> 'state', v_existing.response ->> 'mimeType',
      (v_existing.response ->> 'sizeBytes')::bigint, v_existing.response ->> 'visibility',
      v_existing.response ->> 'objectPath', (v_existing.response ->> 'expiresAt')::timestamptz;
    return;
  end if;
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values (p_tree_id, v_actor, 'media.upload_intent', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours');
  select * into v_result from private.media_upload_intent_authorized(
    p_tree_id, p_filename, p_mime, p_size, p_sha256, p_purpose, p_visibility);
  update private.idempotency_records set response = jsonb_build_object(
    'id', v_result.id, 'version', v_result.version, 'state', v_result.state,
    'mimeType', v_result.mime_type, 'sizeBytes', v_result.size_bytes,
    'visibility', v_result.visibility, 'objectPath', v_result.object_path, 'expiresAt', v_result.expires_at)
  where tree_id = p_tree_id and actor_id = v_actor and operation = 'media.upload_intent'
    and idempotency_key = p_idempotency_key;
  return query select v_result.id, v_result.version, v_result.state, v_result.mime_type,
    v_result.size_bytes, v_result.visibility, v_result.object_path, v_result.expires_at;
end;
$$;

create or replace function private.media_upload_begin(p_asset_id uuid)
returns table (id uuid, tree_id uuid, version bigint, state text,
  declared_mime text, size_bytes bigint, expected_sha256 text, created_by uuid)
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  update private.media_assets set state = 'uploading'
  where media_assets.id = p_asset_id and media_assets.created_by = v_actor and media_assets.state in ('requested','uploading')
  returning media_assets.id, media_assets.tree_id, media_assets.version, media_assets.state,
    media_assets.declared_mime, media_assets.size_bytes,
    media_assets.expected_sha256, media_assets.created_by
  into id, tree_id, version, state, declared_mime, size_bytes, expected_sha256, created_by;
  if id is null then raise exception using errcode = 'P0002', message = 'media upload intent not found or unavailable'; end if;
  return next;
end;
$$;

create or replace function private.media_upload_marked(
  p_asset_id uuid, p_actual_size bigint, p_actual_mime text, p_actual_sha256 text
)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  update private.media_assets set state = 'uploaded', actual_size_bytes = p_actual_size,
    mime_type = p_actual_mime, actual_sha256 = p_actual_sha256
  where media_assets.id = p_asset_id and media_assets.created_by = v_actor and media_assets.state = 'uploading'
    and p_actual_size = media_assets.size_bytes and p_actual_mime = media_assets.declared_mime and p_actual_sha256 = media_assets.expected_sha256
  returning media_assets.id, media_assets.version, media_assets.state, media_assets.mime_type,
    media_assets.actual_size_bytes, media_assets.visibility
  into id, version, state, mime_type, size_bytes, visibility;
  if id is null then raise exception using errcode = 'P0001', message = 'uploaded media metadata did not match intent'; end if;
  return next;
end;
$$;

create or replace function private.media_upload_failed(p_asset_id uuid, p_reason text)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_actor uuid := auth.uid();
begin
  update private.media_assets set state = 'failed', scan_code = left(coalesce(p_reason, 'UPLOAD_FAILED'), 120)
  where media_assets.id = p_asset_id and media_assets.created_by = v_actor and media_assets.state in ('uploading','uploaded')
  returning media_assets.id, media_assets.version, media_assets.state, media_assets.mime_type,
    coalesce(media_assets.actual_size_bytes, media_assets.size_bytes), media_assets.visibility
  into id, version, state, mime_type, size_bytes, visibility;
  if id is null then raise exception using errcode = 'P0002', message = 'media upload not found'; end if;
  return next;
end;
$$;

create or replace function private.media_asset_upload_context(p_asset_id uuid)
returns table (id uuid, tree_id uuid, version bigint, state text,
  declared_mime text, size_bytes bigint, expected_sha256 text, created_by uuid)
language sql stable security definer set search_path = pg_catalog
as $$
  select m.id, m.tree_id, m.version, m.state, m.declared_mime,
    m.size_bytes, m.expected_sha256, m.created_by
  from private.media_assets m
  where m.id = p_asset_id and (m.created_by = auth.uid() or private.has_capability(m.tree_id, 'media.read', null));
$$;

create or replace function private.media_finalize_authorized(
  p_asset_id uuid, p_actual_size bigint, p_actual_mime text, p_actual_sha256 text,
  p_scan_status text, p_scan_code text
)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, alt_text text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_asset private.media_assets%rowtype;
  v_state text;
begin
  select * into v_asset from private.media_assets
  where media_assets.id = p_asset_id
    and (media_assets.created_by = v_actor or private.has_capability(media_assets.tree_id, 'media.read', null))
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'media asset not found'; end if;
  if v_asset.state in ('ready','rejected','failed','quarantined') then
    return query select v_asset.id, v_asset.version, v_asset.state,
      coalesce(v_asset.mime_type, v_asset.declared_mime),
      coalesce(v_asset.actual_size_bytes, v_asset.size_bytes), v_asset.visibility, v_asset.alt_text;
    return;
  end if;
  if v_asset.state not in ('uploaded','scanning','processing') then
    raise exception using errcode = 'P0001', message = 'media asset is not ready for finalize';
  end if;
  if p_actual_size <> v_asset.size_bytes or p_actual_mime <> v_asset.declared_mime
     or p_actual_sha256 <> v_asset.expected_sha256 then
    v_state := 'rejected';
  elsif p_scan_status = 'passed' then
    v_state := 'ready';
  else
    v_state := 'quarantined';
  end if;
  update private.media_assets set state = v_state, actual_size_bytes = p_actual_size,
    mime_type = p_actual_mime, actual_sha256 = p_actual_sha256,
    scan_code = left(coalesce(p_scan_code, 'UNKNOWN'), 120), scan_completed_at = clock_timestamp()
  where media_assets.id = p_asset_id;
  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id,
    redacted_summary, metadata)
  values (v_asset.tree_id, v_actor, 'media.' || v_state, 'media', p_asset_id, gen_random_uuid(),
    'Media security scan completed with redacted payload',
    jsonb_build_object('state', v_state, 'mimeType', p_actual_mime, 'sizeBytes', p_actual_size));
  insert into private.outbox (tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values (v_asset.tree_id, 'media.' || v_state, p_asset_id, v_asset.version + 1,
    'media.' || v_state || ':' || p_asset_id::text || ':' || (v_asset.version + 1)::text, v_actor);
  return query select m.id, m.version, m.state, m.mime_type, m.actual_size_bytes,
    m.visibility, m.alt_text from private.media_assets m where m.id = p_asset_id;
end;
$$;

create or replace function private.media_finalize_idempotent(
  p_asset_id uuid, p_actual_size bigint, p_actual_mime text, p_actual_sha256 text,
  p_scan_status text, p_scan_code text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, alt_text text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_tree_id uuid;
  v_existing private.idempotency_records%rowtype;
  v_result record;
begin
  select tree_id into v_tree_id from private.media_assets where media_assets.id = p_asset_id;
  if v_tree_id is null then raise exception using errcode = 'P0002', message = 'media asset not found'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;
  select * into v_existing from private.idempotency_records as r
  where r.tree_id = v_tree_id and r.actor_id = v_actor and r.operation = 'media.finalize'
    and r.idempotency_key = p_idempotency_key and r.expires_at > clock_timestamp() for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response ->> 'id')::uuid, (v_existing.response ->> 'version')::bigint,
      v_existing.response ->> 'state', v_existing.response ->> 'mimeType',
      (v_existing.response ->> 'sizeBytes')::bigint, v_existing.response ->> 'visibility',
      v_existing.response ->> 'altText';
    return;
  end if;
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values (v_tree_id, v_actor, 'media.finalize', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours');
  select * into v_result from private.media_finalize_authorized(
    p_asset_id, p_actual_size, p_actual_mime, p_actual_sha256, p_scan_status, p_scan_code);
  update private.idempotency_records set response = jsonb_build_object(
    'id', v_result.id, 'version', v_result.version, 'state', v_result.state,
    'mimeType', v_result.mime_type, 'sizeBytes', v_result.size_bytes,
    'visibility', v_result.visibility, 'altText', v_result.alt_text)
  where tree_id = v_tree_id and actor_id = v_actor and operation = 'media.finalize'
    and idempotency_key = p_idempotency_key;
  return query select v_result.id, v_result.version, v_result.state, v_result.mime_type,
    v_result.size_bytes, v_result.visibility, v_result.alt_text;
end;
$$;

create or replace function private.media_asset_get_authorized(p_asset_id uuid)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, alt_text text)
language sql stable security definer set search_path = pg_catalog
as $$
  select m.id, m.version, m.state, coalesce(m.mime_type, m.declared_mime),
    coalesce(m.actual_size_bytes, m.size_bytes), m.visibility, m.alt_text
  from private.media_assets m
  where m.id = p_asset_id and (
    m.created_by = auth.uid()
    or (m.state = 'ready' and (m.visibility = 'public' or private.has_capability(m.tree_id, 'media.read', null)))
  );
$$;

create or replace function private.media_asset_delete_authorized(p_asset_id uuid)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, alt_text text, object_path text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_actor uuid := auth.uid();
begin
  update private.media_assets set state = 'failed', scan_code = 'DELETED_BY_OWNER'
  where media_assets.id = p_asset_id and media_assets.created_by = v_actor and media_assets.state not in ('ready','processing');
  if not found then raise exception using errcode = '42501', message = 'media deletion is not allowed'; end if;
  return query select m.id, m.version, m.state, coalesce(m.mime_type, m.declared_mime),
    coalesce(m.actual_size_bytes, m.size_bytes), m.visibility, m.alt_text, m.object_path
  from private.media_assets m where m.id = p_asset_id;
end;
$$;

create or replace function api.media_upload_intent_idempotent(
  p_tree_id uuid, p_filename text, p_mime text, p_size bigint, p_sha256 text,
  p_purpose text, p_visibility text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, expires_at timestamptz)
language sql security invoker set search_path = pg_catalog as $$
  select id, version, state, mime_type, size_bytes, visibility, expires_at from private.media_upload_intent_idempotent($1,$2,$3,$4,$5,$6,$7,$8,$9);
$$;

create or replace function api.media_upload_begin(p_asset_id uuid)
returns table (id uuid, tree_id uuid, version bigint, state text,
  declared_mime text, size_bytes bigint, expected_sha256 text, created_by uuid)
language sql security invoker set search_path = pg_catalog as $$
  select id, tree_id, version, state, declared_mime, size_bytes, expected_sha256, created_by from private.media_upload_begin($1);
$$;

create or replace function api.media_upload_marked(p_asset_id uuid, p_actual_size bigint,
  p_actual_mime text, p_actual_sha256 text)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_upload_marked($1,$2,$3,$4);
$$;

create or replace function api.media_upload_failed(p_asset_id uuid, p_reason text)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint, visibility text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_upload_failed($1,$2);
$$;

create or replace function api.media_asset_upload_context(p_asset_id uuid)
returns table (id uuid, tree_id uuid, version bigint, state text,
  declared_mime text, size_bytes bigint, expected_sha256 text, created_by uuid)
language sql security invoker set search_path = pg_catalog as $$
  select id, tree_id, version, state, declared_mime, size_bytes, expected_sha256, created_by from private.media_asset_upload_context($1);
$$;

create or replace function api.media_finalize_idempotent(
  p_asset_id uuid, p_actual_size bigint, p_actual_mime text, p_actual_sha256 text,
  p_scan_status text, p_scan_code text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, alt_text text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_finalize_idempotent($1,$2,$3,$4,$5,$6,$7,$8);
$$;

create or replace function api.media_asset_get(p_asset_id uuid)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, alt_text text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_asset_get_authorized($1);
$$;

create or replace function api.media_asset_delete(p_asset_id uuid)
returns table (id uuid, version bigint, state text, mime_type text, size_bytes bigint,
  visibility text, alt_text text)
language sql security invoker set search_path = pg_catalog as $$
  select id, version, state, mime_type, size_bytes, visibility, alt_text from private.media_asset_delete_authorized($1);
$$;

create or replace function private.media_storage_insert_allowed(p_name text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from private.media_assets m where m.object_path = p_name
    and m.created_by = auth.uid() and m.state in ('requested','uploading'));
$$;

create or replace function private.media_storage_select_allowed(p_name text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from private.media_assets m where m.object_path = p_name and (
    m.created_by = auth.uid()
    or (m.state = 'ready' and (m.visibility = 'public' or private.has_capability(m.tree_id, 'media.read', null)))
  ));
$$;

drop policy if exists media_assets_insert on storage.objects;
create policy media_assets_insert on storage.objects for insert to authenticated
with check (bucket_id = 'family-assets' and private.media_storage_insert_allowed(name));
drop policy if exists media_assets_select on storage.objects;
create policy media_assets_select on storage.objects for select to authenticated
using (bucket_id = 'family-assets' and private.media_storage_select_allowed(name));

revoke all on table private.media_assets from public, anon, authenticated;
revoke all on function private.media_validate_upload(text,bigint,text,text,text,text) from public, anon, authenticated;
revoke all on function private.media_upload_intent_authorized(uuid,text,text,bigint,text,text,text) from public, anon, authenticated;
revoke all on function private.media_upload_intent_idempotent(uuid,text,text,bigint,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function private.media_upload_begin(uuid) from public, anon, authenticated;
revoke all on function private.media_upload_marked(uuid,bigint,text,text) from public, anon, authenticated;
revoke all on function private.media_upload_failed(uuid,text) from public, anon, authenticated;
revoke all on function private.media_asset_upload_context(uuid) from public, anon, authenticated;
revoke all on function private.media_finalize_authorized(uuid,bigint,text,text,text,text) from public, anon, authenticated;
revoke all on function private.media_finalize_idempotent(uuid,bigint,text,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function private.media_asset_get_authorized(uuid) from public, anon, authenticated;
revoke all on function private.media_asset_delete_authorized(uuid) from public, anon, authenticated;
revoke all on function private.media_storage_insert_allowed(text) from public, anon, authenticated;
revoke all on function private.media_storage_select_allowed(text) from public, anon, authenticated;

revoke all on function api.media_upload_intent_idempotent(uuid,text,text,bigint,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function api.media_upload_begin(uuid) from public, anon, authenticated;
revoke all on function api.media_upload_marked(uuid,bigint,text,text) from public, anon, authenticated;
revoke all on function api.media_upload_failed(uuid,text) from public, anon, authenticated;
revoke all on function api.media_asset_upload_context(uuid) from public, anon, authenticated;
revoke all on function api.media_finalize_idempotent(uuid,bigint,text,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function api.media_asset_get(uuid) from public, anon, authenticated;
revoke all on function api.media_asset_delete(uuid) from public, anon, authenticated;

grant execute on function private.media_upload_intent_authorized(uuid,text,text,bigint,text,text,text) to authenticated;
grant execute on function private.media_upload_intent_idempotent(uuid,text,text,bigint,text,text,text,uuid,text) to authenticated;
grant execute on function private.media_upload_begin(uuid) to authenticated;
grant execute on function private.media_upload_marked(uuid,bigint,text,text) to authenticated;
grant execute on function private.media_upload_failed(uuid,text) to authenticated;
grant execute on function private.media_asset_upload_context(uuid) to authenticated;
grant execute on function private.media_finalize_authorized(uuid,bigint,text,text,text,text) to authenticated;
grant execute on function private.media_finalize_idempotent(uuid,bigint,text,text,text,text,uuid,text) to authenticated;
grant execute on function private.media_asset_get_authorized(uuid) to authenticated;
grant execute on function private.media_asset_delete_authorized(uuid) to authenticated;
grant execute on function private.media_storage_insert_allowed(text) to authenticated;
grant execute on function private.media_storage_select_allowed(text) to authenticated;

grant usage on schema api to authenticated;
grant execute on function api.media_upload_intent_idempotent(uuid,text,text,bigint,text,text,text,uuid,text) to authenticated;
grant execute on function api.media_upload_begin(uuid) to authenticated;
grant execute on function api.media_upload_marked(uuid,bigint,text,text) to authenticated;
grant execute on function api.media_upload_failed(uuid,text) to authenticated;
grant execute on function api.media_asset_upload_context(uuid) to authenticated;
grant execute on function api.media_finalize_idempotent(uuid,bigint,text,text,text,text,uuid,text) to authenticated;
grant execute on function api.media_asset_get(uuid) to authenticated;
grant execute on function api.media_asset_delete(uuid) to authenticated;

commit;
