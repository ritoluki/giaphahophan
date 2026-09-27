-- Synthetic-only M12-02 test. The transaction is rolled back.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '8b000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm12-publish-author@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '8b000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm12-publish-reviewer@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');

insert into private.trees (id, created_by, slug, name, data_mode)
values ('8c000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000001', 'm12-publish-test', 'Synthetic M12 Publish Test', 'demo');

insert into private.content_pages (id, tree_id, created_by, slug, kind, visibility)
values ('8d000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000001', 'publish-demo', 'news', 'public');

insert into private.content_revisions (id, tree_id, created_by, page_id, title, body)
values (
  '8e000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001',
  '8d000000-0000-4000-8000-000000000001',
  'Bài viết bản nháp',
  '{"version":1,"blocks":[{"type":"paragraph","children":[{"type":"text","text":"Bản nháp không public"}]}]}'::jsonb
);

update private.content_revisions
set status = 'submitted', version = 2
where id = '8e000000-0000-4000-8000-000000000001';

update private.content_revisions
set status = 'approved', version = 3, approved_by = '8b000000-0000-4000-8000-000000000002'
where id = '8e000000-0000-4000-8000-000000000001';

update private.content_revisions
set status = 'published', version = 4
where id = '8e000000-0000-4000-8000-000000000001';

update private.content_pages
set published_revision_id = '8e000000-0000-4000-8000-000000000001', version = 2
where id = '8d000000-0000-4000-8000-000000000001';

select case when p.published_revision_id = r.id and r.status = 'published' then 1 else 0 end as published_pointer_ok
from private.content_pages p
join private.content_revisions r on r.tree_id = p.tree_id and r.id = p.published_revision_id
where p.id = '8d000000-0000-4000-8000-000000000001' \gset m12_publish_
select case when :'m12_publish_published_pointer_ok' = '1' then 1 else 1 / 0 end;

do $$
begin
  begin
    update private.content_revisions
    set title = 'Không được sửa snapshot', version = 5
    where id = '8e000000-0000-4000-8000-000000000001';
    raise exception 'published revision was mutable';
  exception when sqlstate '55006' then
    null;
  end;
end $$;

insert into private.content_revisions (id, tree_id, created_by, page_id, title, body)
values (
  '8f000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001',
  '8d000000-0000-4000-8000-000000000001',
  'Bản nháp mới',
  '{"version":1,"blocks":[]}'::jsonb
);

do $$
begin
  begin
    update private.content_pages
    set published_revision_id = '8f000000-0000-4000-8000-000000000001', version = 3
    where id = '8d000000-0000-4000-8000-000000000001';
    raise exception 'draft revision became public';
  exception when check_violation then
    null;
  end;
end $$;

insert into private.content_preview_tokens (
  tree_id, created_by, page_id, revision_id, token_hash, expires_at
)
values (
  '8c000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000002',
  '8d000000-0000-4000-8000-000000000001',
  '8e000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  clock_timestamp() + interval '15 minutes'
);

rollback;
