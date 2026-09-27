-- M07-04: membership administration is server/DB authorized.
begin;

create or replace function private.membership_manage_allowed(p_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from private.memberships as m
    where m.tree_id = p_tree_id
      and m.auth_user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function private.membership_projection(p_membership_id uuid)
returns table (
  id uuid,
  version bigint,
  display_name text,
  role text,
  status text,
  person_id uuid,
  mfa_enrolled boolean,
  grants jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    m.id,
    m.version,
    coalesce(p.display_name, 'Member account') as display_name,
    m.role,
    m.status,
    m.person_id,
    exists (
      select 1
      from auth.mfa_factors as f
      where f.user_id = m.auth_user_id
        and f.factor_type::text = 'totp'
        and f.status::text = 'verified'
    ) as mfa_enrolled,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'version', g.version,
          'capability', g.capability,
          'branchId', g.branch_id,
          'expiresAt', g.expires_at,
          'revokedAt', g.revoked_at
        )
        order by g.created_at, g.id
      )
      from private.capability_grants as g
      where g.tree_id = m.tree_id
        and g.membership_id = m.id
        and g.revoked_at is null
    ), '[]'::jsonb)
  from private.memberships as m
  left join private.persons as p on p.tree_id = m.tree_id and p.id = m.person_id
  where m.id = p_membership_id;
$$;

create or replace function private.membership_list_authorized()
returns table (
  id uuid,
  version bigint,
  display_name text,
  role text,
  status text,
  person_id uuid,
  mfa_enrolled boolean,
  grants jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select projection.*
  from private.memberships as m
  cross join lateral private.membership_projection(m.id) as projection
  where private.membership_manage_allowed(m.tree_id)
  order by m.tree_id, m.role, projection.display_name, m.id;
$$;

create or replace function private.membership_update_idempotent(
  p_membership_id uuid,
  p_role text,
  p_status text,
  p_reason text,
  p_base_version bigint,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  id uuid,
  version bigint,
  display_name text,
  role text,
  status text,
  person_id uuid,
  mfa_enrolled boolean,
  grants jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_target private.memberships%rowtype;
  v_existing private.idempotency_records%rowtype;
  v_projection record;
  v_inserted integer;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;
  if p_role not in ('admin', 'reviewer', 'editor', 'member') then
    raise exception using errcode = '42501', message = 'owner role requires the transfer flow';
  end if;
  if p_status not in ('active', 'suspended', 'revoked') then
    raise exception using errcode = '22023', message = 'unsupported membership status';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 2000 then
    raise exception using errcode = '22023', message = 'membership reason is required and must be <= 2000 characters';
  end if;

  select *
  into v_target
  from private.memberships as m
  where m.id = p_membership_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'membership not found';
  end if;
  if not private.membership_manage_allowed(v_target.tree_id) or not private.has_mfa() then
    raise exception using errcode = '42501', message = 'membership management requires owner/admin and aal2';
  end if;
  if v_target.role = 'owner' then
    raise exception using errcode = '42501', message = 'owner requires the transfer flow';
  end if;
  if v_target.auth_user_id = v_actor and p_role <> v_target.role then
    raise exception using errcode = '42501', message = 'actor cannot change own role';
  end if;

  delete from private.idempotency_records as r
  where r.tree_id = v_target.tree_id
    and r.actor_id = v_actor
    and r.operation = 'membership.update'
    and r.idempotency_key = p_idempotency_key
    and r.expires_at <= clock_timestamp();

  insert into private.idempotency_records (
    tree_id, actor_id, operation, idempotency_key, request_hash, expires_at
  ) values (
    v_target.tree_id, v_actor, 'membership.update', p_idempotency_key,
    p_request_hash, clock_timestamp() + interval '24 hours'
  )
  on conflict (tree_id, actor_id, operation, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select *
  into v_existing
  from private.idempotency_records as r
  where r.tree_id = v_target.tree_id
    and r.actor_id = v_actor
    and r.operation = 'membership.update'
    and r.idempotency_key = p_idempotency_key
  for update;

  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request';
    end if;
    if v_existing.response is null then
      raise exception using errcode = 'P0008', message = 'idempotent request is still in progress';
    end if;
    return query
      select
        (v_existing.response ->> 'id')::uuid,
        (v_existing.response ->> 'version')::bigint,
        v_existing.response ->> 'displayName',
        v_existing.response ->> 'role',
        v_existing.response ->> 'status',
        nullif(v_existing.response ->> 'personId', '')::uuid,
        (v_existing.response ->> 'mfaEnrolled')::boolean,
        coalesce(v_existing.response -> 'grants', '[]'::jsonb);
    return;
  end if;

  update private.memberships as m
  set role = p_role,
      status = p_status,
      approved_by = v_actor
  where m.id = p_membership_id
    and m.version = p_base_version
    and m.role <> 'owner';
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception using errcode = 'P0009', message = 'membership version is stale';
  end if;

  select * into v_projection from private.membership_projection(p_membership_id);

  insert into private.audit_events (
    tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
  ) values (
    v_target.tree_id, v_actor, 'membership.updated', 'membership', p_membership_id,
    gen_random_uuid(), 'Synthetic membership status or role changed'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    v_target.tree_id, 'membership.updated', p_membership_id, v_projection.version,
    'membership.updated:' || p_membership_id::text || ':' || v_projection.version::text,
    v_actor
  );

  update private.idempotency_records as r
  set response = jsonb_build_object(
    'id', v_projection.id,
    'version', v_projection.version,
    'displayName', v_projection.display_name,
    'role', v_projection.role,
    'status', v_projection.status,
    'personId', v_projection.person_id,
    'mfaEnrolled', v_projection.mfa_enrolled,
    'grants', v_projection.grants
  )
  where r.tree_id = v_target.tree_id
    and r.actor_id = v_actor
    and r.operation = 'membership.update'
    and r.idempotency_key = p_idempotency_key;

  return query select * from private.membership_projection(p_membership_id);
end;
$$;

create or replace function private.membership_grant_create_idempotent(
  p_membership_id uuid,
  p_capability text,
  p_branch_id uuid,
  p_expires_at timestamptz,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (id uuid, version bigint, status text)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_target private.memberships%rowtype;
  v_existing private.idempotency_records%rowtype;
  v_grant private.capability_grants%rowtype;
  v_inserted integer;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;
  if p_capability not in ('treasury.write', 'treasury.approve', 'scholarship.review', 'privacy.manage', 'exports.bulk', 'publication.manage', 'operations.read') then
    raise exception using errcode = '22023', message = 'unsupported capability';
  end if;
  if p_expires_at is not null and p_expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'grant expiration must be in the future';
  end if;

  select *
  into v_target
  from private.memberships as m
  where m.id = p_membership_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'membership not found';
  end if;
  if not private.membership_manage_allowed(v_target.tree_id) or not private.has_mfa() then
    raise exception using errcode = '42501', message = 'grant management requires owner/admin and aal2';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from private.branches as b
    where b.id = p_branch_id and b.tree_id = v_target.tree_id
  ) then
    raise exception using errcode = '23503', message = 'grant branch is outside the tree';
  end if;

  delete from private.idempotency_records as r
  where r.tree_id = v_target.tree_id
    and r.actor_id = v_actor
    and r.operation = 'membership.grant.create'
    and r.idempotency_key = p_idempotency_key
    and r.expires_at <= clock_timestamp();

  insert into private.idempotency_records (
    tree_id, actor_id, operation, idempotency_key, request_hash, expires_at
  ) values (
    v_target.tree_id, v_actor, 'membership.grant.create', p_idempotency_key,
    p_request_hash, clock_timestamp() + interval '24 hours'
  )
  on conflict (tree_id, actor_id, operation, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select *
  into v_existing
  from private.idempotency_records as r
  where r.tree_id = v_target.tree_id
    and r.actor_id = v_actor
    and r.operation = 'membership.grant.create'
    and r.idempotency_key = p_idempotency_key
  for update;

  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request';
    end if;
    if v_existing.response is null then
      raise exception using errcode = 'P0008', message = 'idempotent request is still in progress';
    end if;
    return query select
      (v_existing.response ->> 'id')::uuid,
      (v_existing.response ->> 'version')::bigint,
      v_existing.response ->> 'status';
    return;
  end if;

  insert into private.capability_grants (
    tree_id, created_by, membership_id, capability, branch_id, expires_at
  ) values (
    v_target.tree_id, v_actor, p_membership_id, p_capability, p_branch_id, p_expires_at
  )
  returning * into v_grant;

  insert into private.audit_events (
    tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
  ) values (
    v_target.tree_id, v_actor, 'membership.grant.created', 'capability_grant', v_grant.id,
    gen_random_uuid(), 'Synthetic membership capability grant created'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    v_target.tree_id, 'membership.grant.created', v_grant.id, v_grant.version,
    'membership.grant.created:' || v_grant.id::text || ':' || v_grant.version::text,
    v_actor
  );

  update private.idempotency_records as r
  set response = jsonb_build_object('id', v_grant.id, 'version', v_grant.version, 'status', 'active')
  where r.tree_id = v_target.tree_id
    and r.actor_id = v_actor
    and r.operation = 'membership.grant.create'
    and r.idempotency_key = p_idempotency_key;

  return query select v_grant.id, v_grant.version, 'active'::text;
end;
$$;

create unique index if not exists capability_grants_active_key
  on private.capability_grants (tree_id, membership_id, capability, coalesce(branch_id, '00000000-0000-4000-8000-000000000000'::uuid))
  where revoked_at is null;

create or replace function api.members()
returns table (
  id uuid,
  version bigint,
  display_name text,
  role text,
  status text,
  person_id uuid,
  mfa_enrolled boolean,
  grants jsonb
)
language sql
security invoker
set search_path = pg_catalog
as $$
  select * from private.membership_list_authorized();
$$;

create or replace function api.membership_update(
  p_membership_id uuid,
  p_role text,
  p_status text,
  p_reason text,
  p_base_version bigint,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  id uuid,
  version bigint,
  display_name text,
  role text,
  status text,
  person_id uuid,
  mfa_enrolled boolean,
  grants jsonb
)
language sql
security invoker
set search_path = pg_catalog
as $$
  select * from private.membership_update_idempotent(
    p_membership_id, p_role, p_status, p_reason, p_base_version, p_idempotency_key, p_request_hash
  );
$$;

create or replace function api.membership_grant_create(
  p_membership_id uuid,
  p_capability text,
  p_branch_id uuid,
  p_expires_at timestamptz,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (id uuid, version bigint, status text)
language sql
security invoker
set search_path = pg_catalog
as $$
  select * from private.membership_grant_create_idempotent(
    p_membership_id, p_capability, p_branch_id, p_expires_at, p_idempotency_key, p_request_hash
  );
$$;


create or replace function private.membership_list_authorized()
returns table (
  id uuid,
  version bigint,
  display_name text,
  role text,
  status text,
  person_id uuid,
  mfa_enrolled boolean,
  grants jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  if not exists (
    select 1
    from private.memberships as actor
    where actor.auth_user_id = auth.uid()
      and actor.status = 'active'
      and actor.role in ('owner', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'membership list requires owner/admin';
  end if;

  return query
    select projection.*
    from private.memberships as m
    cross join lateral private.membership_projection(m.id) as projection
    where private.membership_manage_allowed(m.tree_id)
    order by m.tree_id, m.role, projection.display_name, m.id;
end;
$$;
revoke all on function private.membership_manage_allowed(uuid) from public, anon, authenticated;
revoke all on function private.membership_projection(uuid) from public, anon, authenticated;
revoke all on function private.membership_list_authorized() from public, anon, authenticated;
revoke all on function private.membership_update_idempotent(uuid,text,text,text,bigint,uuid,text) from public, anon, authenticated;
revoke all on function private.membership_grant_create_idempotent(uuid,text,uuid,timestamptz,uuid,text) from public, anon, authenticated;
revoke all on function api.members() from public, anon, authenticated;
revoke all on function api.membership_update(uuid,text,text,text,bigint,uuid,text) from public, anon, authenticated;
revoke all on function api.membership_grant_create(uuid,text,uuid,timestamptz,uuid,text) from public, anon, authenticated;

grant execute on function private.membership_list_authorized() to authenticated;
grant execute on function private.membership_update_idempotent(uuid,text,text,text,bigint,uuid,text) to authenticated;
grant execute on function private.membership_grant_create_idempotent(uuid,text,uuid,timestamptz,uuid,text) to authenticated;

grant execute on function api.members() to authenticated;
grant execute on function api.membership_update(uuid,text,text,text,bigint,uuid,text) to authenticated;
grant execute on function api.membership_grant_create(uuid,text,uuid,timestamptz,uuid,text) to authenticated;

commit;