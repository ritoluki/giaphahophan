-- Synthetic-only M13-03 test. The transaction is rolled back.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', 'a4100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm13-media-author@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');

insert into private.trees (id, created_by, slug, name, data_mode)
values ('a4200000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'm13-media-test', 'Synthetic M13 Media Test', 'demo');

insert into private.sources (id, tree_id, created_by, title, kind, provenance, visibility)
values ('a4300000-0000-4000-8000-000000000001', 'a4200000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'Nguồn hướng dẫn minh họa', 'document', 'Fixture synthetic-only; không phải tư liệu thật.', 'members');

insert into private.places (id, tree_id, created_by, name, kind, address_text, visibility, coordinate_visibility)
values ('a4400000-0000-4000-8000-000000000001', 'a4200000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'Địa điểm media minh họa', 'cemetery', 'Địa chỉ minh họa; không phải nhà riêng.', 'members', 'restricted');

insert into private.media_assets (id, tree_id, created_by, filename, declared_mime, mime_type, size_bytes, actual_size_bytes, expected_sha256, actual_sha256, purpose, visibility, state, object_path, alt_text)
values ('a4500000-0000-4000-8000-000000000001', 'a4200000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'synthetic-place.jpg', 'image/jpeg', 'image/jpeg', 8, 8, repeat('a', 64), repeat('a', 64), 'source', 'restricted', 'ready', 'synthetic/place/original', 'Ảnh địa điểm minh họa');

insert into private.media_links (id, tree_id, created_by, asset_id, place_id, caption)
values ('a4600000-0000-4000-8000-000000000001', 'a4200000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'a4500000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000001', 'Ảnh khu mộ minh họa');

insert into private.place_directions (id, tree_id, created_by, place_id, instruction_text, source_id, visibility)
values ('a4700000-0000-4000-8000-000000000001', 'a4200000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000001', 'Đi theo lối chính; rẽ trái ở cổng minh họa.', 'a4300000-0000-4000-8000-000000000001', 'members');

select case when ml.place_id = p.id and pd.instruction_text like 'Đi theo%' and pd.source_id is not null then 1 else 0 end as m13_media_directions_persistence
from private.media_links ml
join private.places p on p.tree_id = ml.tree_id and p.id = ml.place_id
join private.place_directions pd on pd.tree_id = p.tree_id and pd.place_id = p.id
where ml.id = 'a4600000-0000-4000-8000-000000000001' \gset
select case when :'m13_media_directions_persistence' = '1' then 1 else 1 / 0 end;

do $$
begin
  begin
    insert into private.media_links (tree_id, created_by, asset_id, person_id, place_id)
    values ('a4200000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'a4500000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000099', 'a4400000-0000-4000-8000-000000000001');
    raise exception 'media link accepted multiple targets';
  exception when check_violation then
    null;
  end;
end $$;

do $$
begin
  begin
    insert into private.place_directions (tree_id, place_id, instruction_text, visibility)
    values ('a4200000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000099', 'Không có provider vẫn có text', 'members');
    raise exception 'cross-place directions accepted';
  exception when foreign_key_violation then
    null;
  end;
end $$;

do $$
begin
  execute 'set local role authenticated';
  begin
    execute 'select count(*) from private.place_directions';
    raise exception 'authenticated role read private directions';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end $$;

rollback;