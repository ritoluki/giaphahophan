-- Synthetic-only M12-01 test. The transaction is rolled back.
begin;



insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '88000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm12-rich-text@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');

insert into private.trees (id, created_by, slug, name, data_mode)
values ('87000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000001', 'm12-rich-text-test', 'Synthetic M12 Rich Text Test', 'demo');

insert into private.content_pages (id, tree_id, created_by, slug, kind, visibility)
values ('89000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000001', 'lich-su-demo', 'history', 'members');

insert into private.content_revisions (id, tree_id, created_by, page_id, title, body)
values (
  '8a000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000001',
  'Bài viết an toàn',
  '{"version":1,"blocks":[{"type":"heading","level":2,"children":[{"type":"strong","text":"Lịch sử"}]},{"type":"paragraph","children":[{"type":"link","href":"/tin-ho/lich-su","label":"Đọc tiếp"}]},{"type":"image","assetId":"81000000-0000-4000-8000-000000000001","alt":"Ảnh tư liệu"}]}'::jsonb
);

do $$
begin
  begin
    insert into private.content_revisions (tree_id, created_by, page_id, title, body)
    values (
      '87000000-0000-4000-8000-000000000001',
      '88000000-0000-4000-8000-000000000001',
      '89000000-0000-4000-8000-000000000001',
      'Bài viết độc hại',
      '{"version":1,"blocks":[{"type":"paragraph","children":[{"type":"link","href":"javascript:alert(1)","label":"X"}]}]}'::jsonb
    );
    raise exception 'unsafe rich text body was accepted';
  exception when check_violation then
    null;
  end;
end $$;

do $$
begin
  begin
    insert into private.content_revisions (tree_id, created_by, page_id, title, body)
    values (
      '87000000-0000-4000-8000-000000000001',
      '88000000-0000-4000-8000-000000000001',
      '89000000-0000-4000-8000-000000000001',
      'Bài viết nhúng script',
      '{"version":1,"blocks":[{"type":"script","html":"<script>alert(1)</script>"}]}'::jsonb
    );
    raise exception 'unknown rich text block was accepted';
  exception when check_violation then
    null;
  end;
end $$;

select case when private.content_body_is_allowlisted(
  '{"version":1,"blocks":[{"type":"divider"}]}'::jsonb
) then 1 else 0 end as valid_body_ok \gset m12_
select case when :'m12_valid_body_ok' = '1' then 1 else 1 / 0 end;

rollback;
