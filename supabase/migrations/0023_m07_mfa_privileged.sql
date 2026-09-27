-- M07-03: privileged review mutations require an Authenticator Assurance Level 2 session.
begin;

create or replace function private.has_mfa()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function private.has_capability(
  p_tree_id uuid,
  p_capability text,
  p_branch_id uuid default null
)
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
      and (p_capability <> 'proposal.review' or private.has_mfa())
      and (
        m.role in ('owner', 'admin')
        or exists (
          select 1
          from private.capability_grants as g
          where g.tree_id = p_tree_id
            and g.membership_id = m.id
            and g.capability = p_capability
            and g.revoked_at is null
            and (g.expires_at is null or g.expires_at > clock_timestamp())
            and (g.branch_id is null or g.branch_id = p_branch_id)
        )
      )
  );
$$;

revoke all on function private.has_mfa() from public, anon, authenticated;
revoke all on function private.has_capability(uuid, text, uuid) from public, anon, authenticated;

commit;