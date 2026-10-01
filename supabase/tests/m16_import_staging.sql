-- Synthetic-only M16-01 integration. Transaction is rolled back.
begin;
select private.media_validate_upload('application/json',12,'demo.json',repeat('a',64),'import','restricted');
do $$ begin
  begin
    perform private.media_validate_upload('application/json',12,'demo.json',repeat('a',64),'album','restricted');
    raise exception 'JSON MIME was accepted outside import purpose';
  exception when sqlstate '22023' then null;
  end;
end $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','b1600000-0000-4000-8000-000000000001','authenticated','authenticated','m16-owner@example.test','',clock_timestamp(),clock_timestamp(),clock_timestamp(),'{}','{}'),
       ('00000000-0000-0000-0000-000000000000','b1600000-0000-4000-8000-000000000002','authenticated','authenticated','m16-member@example.test','',clock_timestamp(),clock_timestamp(),clock_timestamp(),'{}','{}');
insert into private.trees(id,created_by,slug,name,data_mode)
values('b1610000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','m16-import-test','Synthetic M16 Import','demo');
insert into private.memberships(id,tree_id,created_by,auth_user_id,role,status,approved_by)
values ('b1620000-0000-4000-8000-000000000001','b1610000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','owner','active','b1600000-0000-4000-8000-000000000001'),
       ('b1620000-0000-4000-8000-000000000002','b1610000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000002','member','active','b1600000-0000-4000-8000-000000000001');
insert into private.media_assets(id,tree_id,created_by,filename,declared_mime,mime_type,size_bytes,actual_size_bytes,expected_sha256,actual_sha256,purpose,visibility,state,object_path)
values('b1630000-0000-4000-8000-000000000001','b1610000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','synthetic.json','application/json','application/json',128,128,repeat('a',64),repeat('a',64),'import','restricted','ready','synthetic/m16/intake.json');
select count(*) as person_count from private.persons where tree_id='b1610000-0000-4000-8000-000000000001' \gset before_

select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select count(*)=1 as authorized_tree_list from api.import_tree_list() \gset tree_list_
\if :tree_list_authorized_tree_list
\else
  \quit 1
\endif
select * from api.import_source_context('b1630000-0000-4000-8000-000000000001') \gset source_
select case when :'source_tree_id'='b1610000-0000-4000-8000-000000000001' and :'source_sha256'=repeat('a',64) then 1 else 1/0 end;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-v1','v1','demo','b1640000-0000-4000-8000-000000000001',repeat('c',64)) \gset job_
select case when :'job_status'='queued' and :'job_classification'='canonical' and :'job_file_sha256'=repeat('a',64) then 1 else 1/0 end;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-v1','v1','demo','b1640000-0000-4000-8000-000000000001',repeat('c',64)) \gset replay_
select case when :'replay_id'=:'job_id' and :'replay_version'=:'job_version' then 1 else 1/0 end;
select * from api.import_stage_rows(:'job_id'::uuid,
  '[{"rowNumber":1,"externalId":"synthetic-1","rawPayload":{"birthDate":"circa 1940"},"normalized":{"externalId":"synthetic-1","displayName":"Fictional Person"},"status":"valid","errors":[]},{"rowNumber":2,"externalId":"synthetic-1","rawPayload":{"name":"duplicate"},"normalized":null,"status":"review","errors":["duplicate_external_id_in_source"]},{"rowNumber":3,"externalId":"row-3","rawPayload":{"displayName":""},"normalized":null,"status":"invalid","errors":["displayName"]}]'::jsonb,
  '["duplicate_external_ids_require_review"]'::jsonb) \gset preview_
select case when :'preview_status'='needs_review' and :'preview_valid'='1' and :'preview_invalid'='1' and :'preview_possible_duplicates'='1' and length(:'preview_snapshot_hash')=64 then 1 else 1/0 end;
select * from api.import_stage_rows(:'job_id'::uuid,
  '[{"rowNumber":1,"externalId":"synthetic-1","rawPayload":{"birthDate":"circa 1940"},"normalized":{"externalId":"synthetic-1","displayName":"Fictional Person"},"status":"valid","errors":[]},{"rowNumber":2,"externalId":"synthetic-1","rawPayload":{"name":"duplicate"},"normalized":null,"status":"review","errors":["duplicate_external_id_in_source"]},{"rowNumber":3,"externalId":"row-3","rawPayload":{"displayName":""},"normalized":null,"status":"invalid","errors":["displayName"]}]'::jsonb,
  '["duplicate_external_ids_require_review"]'::jsonb) \gset stage_replay_
select case when :'stage_replay_version'=:'preview_version' and :'stage_replay_snapshot_hash'=:'preview_snapshot_hash' then 1 else 1/0 end;
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
  begin
    perform * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-v1','v1','demo','b1640000-0000-4000-8000-000000000006',repeat('2',64));
    raise exception 'member without import grant was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api.import_grant_create('b1620000-0000-4000-8000-000000000002',null,null,
  'b1640000-0000-4000-8000-000000000004',repeat('f',64)) \gset grant_
select * from api.import_grant_create('b1620000-0000-4000-8000-000000000002',null,null,
  'b1640000-0000-4000-8000-000000000004',repeat('f',64)) \gset grant_replay_
select case when :'grant_id'=:'grant_replay_id' and :'grant_version'=:'grant_replay_version' then 1 else 1/0 end;
reset role;
select count(*)=3 as staging_rows_persisted from private.import_rows where job_id=:'preview_id'::uuid \gset staging_
\if :staging_staging_rows_persisted
\else
  \quit 1
\endif
select (select count(*) from private.persons where tree_id='b1610000-0000-4000-8000-000000000001')=:'before_person_count'::bigint as unchanged \gset canonical_
\if :canonical_unchanged
\else
  \quit 1
\endif

select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select * from api.import_source_context('b1630000-0000-4000-8000-000000000001') \gset granted_source_
select case when :'granted_source_tree_id'='b1610000-0000-4000-8000-000000000001' then 1 else 1/0 end;
do $$ begin
  begin
    perform * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-v1','v1','real','b1640000-0000-4000-8000-000000000003',repeat('e',64));
    raise exception 'real-data import without H5 was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from api.import_source_context('b1630000-0000-4000-8000-000000000001');
    -- This member was explicitly granted imports.manage above.
  exception when others then raise exception 'granted member could not read import context';
  end;
  begin
    perform * from api.import_grant_create('b1620000-0000-4000-8000-000000000001',null,null,
      'b1640000-0000-4000-8000-000000000005',repeat('1',64));
    raise exception 'non-admin without aal2 was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
