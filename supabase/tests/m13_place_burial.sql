-- Synthetic-only M13-01 test. The transaction is rolled back.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'a3100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm13-place-author@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');

insert into private.trees (id, created_by, slug, name, data_mode)
values ('a3200000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'm13-place-test', 'Synthetic M13 Place Test', 'demo');

insert into private.persons (id, tree_id, created_by, code, display_name, name_search, life_status, visibility, confidence)
values ('a3300000-0000-4000-8000-000000000001', 'a3200000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'M13-001', 'Người minh họa', 'nguoi minh hoa', 'deceased', 'members', 'supported');

insert into private.sources (id, tree_id, created_by, title, kind, provenance, visibility)
values ('a3400000-0000-4000-8000-000000000001', 'a3200000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'Nguồn minh họa M13', 'document', 'Fixture synthetic-only; không phải tư liệu thật.', 'members');

insert into private.places (id, tree_id, created_by, name, kind, address_text, visibility, coordinate_visibility)
values ('a3500000-0000-4000-8000-000000000001', 'a3200000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'Khu tưởng niệm minh họa', 'cemetery', 'Địa chỉ minh họa; không phải nhà riêng.', 'members', 'restricted');

insert into private.burial_records (id, tree_id, created_by, person_id, place_id, locator, source_id, visibility)
values ('a3600000-0000-4000-8000-000000000001', 'a3200000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'a3300000-0000-4000-8000-000000000001', 'a3500000-0000-4000-8000-000000000001', 'Khu minh họa · Lô A', 'a3400000-0000-4000-8000-000000000001', 'members');

select case when p.name = 'Khu tưởng niệm minh họa' and b.locator = 'Khu minh họa · Lô A' and b.source_id is not null then 1 else 0 end as m13_persistence_ok
from private.places p join private.burial_records b on b.tree_id = p.tree_id and b.place_id = p.id
where p.id = 'a3500000-0000-4000-8000-000000000001' \gset
select case when :'m13_persistence_ok' = '1' then 1 else 1 / 0 end;

select case when count(*) = 0 then 1 else 0 end as no_home_address_column
from information_schema.columns
where table_schema = 'private' and table_name in ('places', 'burial_records') and column_name in ('home_address', 'residential_address') \gset
select case when :'no_home_address_column' = '1' then 1 else 1 / 0 end;

do $$
begin
  begin
    insert into private.places (tree_id, name, kind, latitude, longitude, visibility, coordinate_visibility)
    values ('a3200000-0000-4000-8000-000000000001', 'Tọa độ sai', 'temple', 91, 181, 'members', 'restricted');
    raise exception 'invalid place coordinates were accepted';
  exception when check_violation then
    null;
  end;
end $$;

do $$
begin
  begin
    insert into private.burial_records (tree_id, person_id, place_id, visibility)
    values ('a3200000-0000-4000-8000-000000000099', 'a3300000-0000-4000-8000-000000000001', 'a3500000-0000-4000-8000-000000000001', 'members');
    raise exception 'cross-tree burial record was accepted';
  exception when foreign_key_violation then
    null;
  end;
end $$;

do $$
begin
  execute 'set local role authenticated';
  begin
    execute 'select count(*) from private.places';
    raise exception 'authenticated role read private places';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end $$;

rollback;