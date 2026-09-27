-- M07-01: single-use invitation core.
-- Raw email/token values never persist; delivery is queued for the provider worker.

begin;

create table if not exists private.invitations (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  email_hash text not null,
  email_ciphertext text,
  token_hash text not null,
  intended_role text not null check (intended_role in ('admin', 'reviewer', 'editor', 'member')),
  branch_id uuid,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (tree_id, id),
  unique (token_hash),
  foreign key (tree_id, branch_id) references private.branches(tree_id, id),
  check (length(email_hash) = 64),
  check (length(token_hash) = 64),
  check (expires_at > created_at)
);

drop trigger if exists touch_invitations on private.invitations;
create trigger touch_invitations
before update on private.invitations
for each row execute function private.touch_updated_at();

create index if not exists invitations_tree_open_idx
  on private.invitations (tree_id, created_at desc)
  where accepted_at is null and revoked_at is null;

alter table private.invitations enable row level security;
alter table private.invitations force row level security;
revoke all on table private.invitations from public, anon, authenticated;

create or replace function private.invitation_create_authorized(
  p_tree_id uuid,
  p_email_hash text,
  p_email_ciphertext text,
  p_intended_role text,
  p_branch_id uuid,
  p_token_hash text
)
returns table (id uuid, tree_id uuid, status text, version bigint)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation private.invitations%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if not private.has_capability(p_tree_id, 'membership.manage', p_branch_id) then
    raise exception using errcode = '42501', message = 'membership management capability required';
  end if;
  if p_intended_role not in ('admin', 'reviewer', 'editor', 'member') then
    raise exception using errcode = '22023', message = 'unsupported invitation role';
  end if;
  if p_email_hash is null or length(p_email_hash) <> 64 or p_token_hash is null or length(p_token_hash) <> 64 then
    raise exception using errcode = '22023', message = 'invitation hashes are invalid';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from private.branches as b where b.tree_id = p_tree_id and b.id = p_branch_id
  ) then
    raise exception using errcode = '23503', message = 'invitation branch is outside the tree';
  end if;
  if (
    select count(*) from private.invitations as i
    where i.tree_id = p_tree_id and i.created_by = v_actor and i.created_at > clock_timestamp() - interval '1 hour'
  ) >= 20 then
    raise exception using errcode = 'P0007', message = 'invitation rate limit reached';
  end if;

  insert into private.invitations (
    tree_id, created_by, email_hash, email_ciphertext, token_hash, intended_role, branch_id, expires_at
  ) values (
    p_tree_id, v_actor, p_email_hash, p_email_ciphertext, p_token_hash, p_intended_role, p_branch_id,
    clock_timestamp() + interval '7 days'
  )
  returning * into v_invitation;

  insert into private.audit_events (
    tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
  ) values (
    p_tree_id, v_actor, 'invitation.created', 'invitation', v_invitation.id, gen_random_uuid(),
    'Invitation queued without storing raw email or token'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    p_tree_id, 'invitation.created', v_invitation.id, v_invitation.version,
    'invitation.created:' || v_invitation.id::text || ':' || v_invitation.version::text, v_actor
  );

  return query select v_invitation.id, v_invitation.tree_id, 'queued'::text, v_invitation.version;
end;
$$;

create or replace function private.invitation_create_idempotent(
  p_tree_id uuid,
  p_email_hash text,
  p_email_ciphertext text,
  p_intended_role text,
  p_branch_id uuid,
  p_token_hash text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (id uuid, tree_id uuid, status text, version bigint)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_existing private.idempotency_records%rowtype;
  v_result record;
  v_inserted integer;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;

  delete from private.idempotency_records as r
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'membership.invitation.create'
    and r.idempotency_key = p_idempotency_key and r.expires_at <= clock_timestamp();
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values (p_tree_id, v_actor, 'membership.invitation.create', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours')
  on conflict on constraint idempotency_records_tree_id_actor_id_operation_idempotency__key do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from private.idempotency_records as r
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'membership.invitation.create'
    and r.idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'treeId')::uuid, v_existing.response->>'status', (v_existing.response->>'version')::bigint;
    return;
  end if;

  select * into v_result from private.invitation_create_authorized(p_tree_id, p_email_hash, p_email_ciphertext, p_intended_role, p_branch_id, p_token_hash);
  update private.idempotency_records as r
  set response = jsonb_build_object('id', v_result.id, 'treeId', v_result.tree_id, 'status', v_result.status, 'version', v_result.version)
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'membership.invitation.create' and r.idempotency_key = p_idempotency_key;
  return query select v_result.id, v_result.tree_id, v_result.status, v_result.version;
end;
$$;

create or replace function private.invitation_accept(p_token_hash text)
returns table (id uuid, tree_id uuid, status text, version bigint)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_email_hash text;
  v_invitation private.invitations%rowtype;
  v_membership private.memberships%rowtype;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  select encode(extensions.digest(lower(btrim(u.email)), 'sha256'), 'hex')
  into v_email_hash
  from auth.users as u
  where u.id = v_actor and u.email_confirmed_at is not null;
  if v_email_hash is null then raise exception using errcode = '42501', message = 'verified email is required'; end if;

  select * into v_invitation
  from private.invitations as i
  where i.token_hash = p_token_hash
  for update;
  if not found or v_invitation.accepted_at is not null or v_invitation.revoked_at is not null or v_invitation.expires_at <= clock_timestamp() or v_invitation.email_hash <> v_email_hash then
    raise exception using errcode = 'P0002', message = 'invitation is unavailable';
  end if;
  if exists (select 1 from private.memberships as m where m.tree_id = v_invitation.tree_id and m.auth_user_id = v_actor) then
    raise exception using errcode = '23505', message = 'account already has membership in this tree';
  end if;

  insert into private.memberships (tree_id, created_by, auth_user_id, role, status)
  values (v_invitation.tree_id, v_actor, v_actor, v_invitation.intended_role, 'pending')
  returning * into v_membership;

  update private.invitations as i
  set accepted_at = clock_timestamp()
  where i.id = v_invitation.id;

  insert into private.audit_events (
    tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
  ) values (
    v_invitation.tree_id, v_actor, 'invitation.accepted', 'invitation', v_invitation.id, gen_random_uuid(),
    'Invitation accepted; membership remains pending until approval'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    v_invitation.tree_id, 'membership.pending', v_membership.id, v_membership.version,
    'membership.pending:' || v_membership.id::text || ':' || v_membership.version::text, v_actor
  );

  return query select v_invitation.id, v_invitation.tree_id, 'pending'::text, v_membership.version;
end;
$$;

create or replace function api.invitation_create_idempotent(
  p_tree_id uuid, p_email_hash text, p_email_ciphertext text, p_intended_role text,
  p_branch_id uuid, p_token_hash text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, tree_id uuid, status text, version bigint)
language sql security invoker set search_path = pg_catalog
as $$ select * from private.invitation_create_idempotent(p_tree_id, p_email_hash, p_email_ciphertext, p_intended_role, p_branch_id, p_token_hash, p_idempotency_key, p_request_hash); $$;

create or replace function api.invitation_accept(p_token_hash text)
returns table (id uuid, tree_id uuid, status text, version bigint)
language sql security invoker set search_path = pg_catalog
as $$ select * from private.invitation_accept(p_token_hash); $$;

revoke all on function private.invitation_create_authorized(uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function private.invitation_create_idempotent(uuid, text, text, text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function private.invitation_accept(text) from public, anon, authenticated;
revoke all on function api.invitation_create_idempotent(uuid, text, text, text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function api.invitation_accept(text) from public, anon, authenticated;
grant execute on function private.invitation_create_idempotent(uuid, text, text, text, uuid, text, uuid, text) to authenticated;
grant execute on function api.invitation_create_idempotent(uuid, text, text, text, uuid, text, uuid, text) to authenticated;
grant execute on function private.invitation_accept(text) to authenticated;
grant execute on function api.invitation_accept(text) to authenticated;

comment on table private.invitations is 'Single-use seven-day invitations; raw email/token are never stored and acceptance creates pending membership only.';

commit;
