begin;

create table if not exists private.content_preview_tokens (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  page_id uuid not null,
  revision_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique (tree_id, id),
  unique (tree_id, token_hash),
  foreign key (tree_id, page_id) references private.content_pages(tree_id, id),
  foreign key (tree_id, revision_id) references private.content_revisions(tree_id, id),
  check (length(btrim(token_hash)) between 32 and 128),
  check (expires_at > created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists content_preview_tokens_expiry_idx
  on private.content_preview_tokens (tree_id, expires_at)
  where revoked_at is null;

drop trigger if exists touch_content_preview_tokens on private.content_preview_tokens;
create trigger touch_content_preview_tokens before update on private.content_preview_tokens
for each row execute function private.touch_updated_at();

create or replace function private.content_revision_transition_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'published' then
    raise exception using errcode = '55006', message = 'published content revision is immutable';
  end if;
  if new.status = 'approved'
    and (new.approved_by is null or (new.created_by is not null and new.approved_by = new.created_by))
  then
    raise exception using errcode = '42501', message = 'published content requires an independent reviewer';
  end if;
  if new.status = 'published'
    and (new.approved_by is null or new.publish_at is not null or (new.created_by is not null and new.approved_by = new.created_by))
  then
    raise exception using errcode = '42501', message = 'published content requires approved immutable snapshot';
  end if;
  return new;
end;
$$;

drop trigger if exists content_revision_transition_guard on private.content_revisions;
create trigger content_revision_transition_guard
before insert or update on private.content_revisions
for each row execute function private.content_revision_transition_guard();

create or replace function private.content_page_published_revision_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
begin
  if new.published_revision_id is not null and not exists (
    select 1
    from private.content_revisions r
    where r.tree_id = new.tree_id
      and r.id = new.published_revision_id
      and r.status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'published pointer must target a published revision';
  end if;
  return new;
end;
$$;

drop trigger if exists content_page_published_revision_guard on private.content_pages;
create constraint trigger content_page_published_revision_guard
after insert or update on private.content_pages
deferrable initially immediate
for each row execute function private.content_page_published_revision_guard();

alter table private.content_preview_tokens enable row level security;
alter table private.content_preview_tokens force row level security;
revoke all on table private.content_preview_tokens from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on table private.content_preview_tokens to service_role;

commit;
