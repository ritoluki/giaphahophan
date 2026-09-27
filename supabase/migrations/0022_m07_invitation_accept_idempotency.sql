-- M07-01: acceptance retries are idempotent without storing the raw token.
begin;

create or replace function private.invitation_accept_idempotent(
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
  v_tree_id uuid;
  v_existing private.idempotency_records%rowtype;
  v_result record;
  v_inserted integer;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  select i.tree_id into v_tree_id from private.invitations as i where i.token_hash = p_token_hash;
  if not found then raise exception using errcode = 'P0002', message = 'invitation is unavailable'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;

  delete from private.idempotency_records as r
  where r.tree_id = v_tree_id and r.actor_id = v_actor and r.operation = 'membership.invitation.accept'
    and r.idempotency_key = p_idempotency_key and r.expires_at <= clock_timestamp();
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values (v_tree_id, v_actor, 'membership.invitation.accept', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours')
  on conflict on constraint idempotency_records_tree_id_actor_id_operation_idempotency__key do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from private.idempotency_records as r
  where r.tree_id = v_tree_id and r.actor_id = v_actor and r.operation = 'membership.invitation.accept'
    and r.idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid, (v_existing.response->>'treeId')::uuid, v_existing.response->>'status', (v_existing.response->>'version')::bigint;
    return;
  end if;

  select * into v_result from private.invitation_accept(p_token_hash);
  update private.idempotency_records as r
  set response = jsonb_build_object('id', v_result.id, 'treeId', v_result.tree_id, 'status', v_result.status, 'version', v_result.version)
  where r.tree_id = v_tree_id and r.actor_id = v_actor and r.operation = 'membership.invitation.accept' and r.idempotency_key = p_idempotency_key;
  return query select v_result.id, v_result.tree_id, v_result.status, v_result.version;
end;
$$;

create or replace function api.invitation_accept_idempotent(
  p_token_hash text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, tree_id uuid, status text, version bigint)
language sql security invoker set search_path = pg_catalog
as $$ select * from private.invitation_accept_idempotent(p_token_hash, p_idempotency_key, p_request_hash); $$;

revoke all on function private.invitation_accept_idempotent(text, uuid, text) from public, anon, authenticated;
revoke all on function api.invitation_accept_idempotent(text, uuid, text) from public, anon, authenticated;
revoke all on function api.invitation_accept(text) from public, anon, authenticated;
grant execute on function private.invitation_accept_idempotent(text, uuid, text) to authenticated;
grant execute on function api.invitation_accept_idempotent(text, uuid, text) to authenticated;

commit;
