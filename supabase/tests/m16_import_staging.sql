-- Synthetic-only M16-01 integration. Transaction is rolled back.
begin;
select private.media_validate_upload('application/json',12,'demo.json',repeat('a',64),'import','restricted');
select private.media_validate_upload('text/plain',12,'demo.ged',repeat('a',64),'import','restricted');
do $$ begin
  begin
    perform private.media_validate_upload('application/json',12,'demo.json',repeat('a',64),'album','restricted');
    raise exception 'JSON MIME was accepted outside import purpose';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform private.media_validate_upload('text/plain',12,'demo.ged',repeat('a',64),'source','restricted');
    raise exception 'GEDCOM MIME was accepted outside import purpose';
  exception when sqlstate '22023' then null;
  end;
end $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','b1600000-0000-4000-8000-000000000001','authenticated','authenticated','m16-owner@example.test','',clock_timestamp(),clock_timestamp(),clock_timestamp(),'{}','{}'),
       ('00000000-0000-0000-0000-000000000000','b1600000-0000-4000-8000-000000000002','authenticated','authenticated','m16-member@example.test','',clock_timestamp(),clock_timestamp(),clock_timestamp(),'{}','{}');
insert into private.trees(id,created_by,slug,name,data_mode)
values('b1610000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','m16-import-test','Synthetic M16 Import','demo'),
      ('b1610000-0000-4000-8000-000000000002','b1600000-0000-4000-8000-000000000001','m16-import-real-test','Synthetic M16 Real-Mode Guard','real');
insert into private.memberships(id,tree_id,created_by,auth_user_id,role,status,approved_by)
values ('b1620000-0000-4000-8000-000000000001','b1610000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','owner','active','b1600000-0000-4000-8000-000000000001'),
       ('b1620000-0000-4000-8000-000000000002','b1610000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000002','member','active','b1600000-0000-4000-8000-000000000001'),
       ('b1620000-0000-4000-8000-000000000003','b1610000-0000-4000-8000-000000000002','b1600000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','owner','active','b1600000-0000-4000-8000-000000000001');
insert into private.capability_grants(tree_id,created_by,membership_id,capability)
values('b1610000-0000-4000-8000-000000000002','b1600000-0000-4000-8000-000000000001','b1620000-0000-4000-8000-000000000003','imports.manage');
insert into private.media_assets(id,tree_id,created_by,filename,declared_mime,mime_type,size_bytes,actual_size_bytes,expected_sha256,actual_sha256,purpose,visibility,state,object_path)
values('b1630000-0000-4000-8000-000000000001','b1610000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','synthetic.json','application/json','application/json',128,128,repeat('a',64),repeat('a',64),'import','restricted','ready','synthetic/m16/intake.json'),
      ('b1630000-0000-4000-8000-000000000002','b1610000-0000-4000-8000-000000000002','b1600000-0000-4000-8000-000000000001','synthetic-real.json','application/json','application/json',128,128,repeat('b',64),repeat('b',64),'import','restricted','ready','synthetic/m16/real-intake.json');
select count(*) as person_count from private.persons where tree_id='b1610000-0000-4000-8000-000000000001' \gset before_

select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select count(*)=1 as authorized_tree_list from api.import_tree_list() \gset tree_list_
\if :tree_list_authorized_tree_list
\else
  \quit 1
\endif
select (not private.import_storage_select_allowed('synthetic/m16/real-intake.json')
  and private.import_storage_select_allowed('synthetic/m16/intake.json')) as storage_mode_isolated \gset storage_guard_
\if :storage_guard_storage_mode_isolated
\else
  \quit 1
\endif
do $$ begin
  begin
    perform * from api.import_create('b1610000-0000-4000-8000-000000000002','b1630000-0000-4000-8000-000000000002','canonical_json','synthetic-real','v1','demo','b1640000-0000-4000-8000-000000000099',repeat('9',64));
    raise exception 'demo import was accepted for a real-mode tree with imports.manage';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from api.import_source_context('b1630000-0000-4000-8000-000000000002');
    raise exception 'real-mode source context was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select (select count(*)=0 from private.import_jobs where tree_id='b1610000-0000-4000-8000-000000000002') as real_tree_has_no_import_jobs \gset real_guard_
\if :real_guard_real_tree_has_no_import_jobs
\else
  \quit 1
\endif
do $$ begin
  begin
    insert into private.import_jobs(tree_id,created_by,source_asset_id,file_sha256,format,source_namespace,mapping_version,parser_version,classification,manifest)
    values('b1610000-0000-4000-8000-000000000002','b1600000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000002',repeat('b',64),'canonical_json','synthetic-real','v1','fixture/1','canonical','{"mode":"demo"}'::jsonb);
    raise exception 'import table trigger accepted a real-mode tree';
  exception when insufficient_privilege then null;
  end;
end $$;
select * from api.import_source_context('b1630000-0000-4000-8000-000000000001') \gset source_
select case when :'source_tree_id'='b1610000-0000-4000-8000-000000000001' and :'source_sha256'=repeat('a',64) then 1 else 1/0 end;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-v1','v1','demo','b1640000-0000-4000-8000-000000000001',repeat('c',64)) \gset job_
select case when :'job_status'='queued' and :'job_classification'='canonical' and :'job_file_sha256'=repeat('a',64) then 1 else 1/0 end;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-v1','v1','demo','b1640000-0000-4000-8000-000000000008',repeat('c',64)) \gset content_replay_
select case when :'content_replay_id'=:'job_id' and :'content_replay_version'=:'job_version' then 1 else 1/0 end;
reset role;
select ((select count(*) from private.import_jobs where tree_id='b1610000-0000-4000-8000-000000000001' and file_sha256=repeat('a',64) and mapping_version='v1')=1
  and (select count(*) from private.audit_events where tree_id='b1610000-0000-4000-8000-000000000001' and action='import.created' and resource_id=:'job_id'::uuid)=1) as content_key_replay_safe \gset content_check_
\if :content_check_content_key_replay_safe
\else
  \quit 1
\endif
set local role authenticated;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-v1','structured-json/1','demo','b1640000-0000-4000-8000-000000000007',repeat('d',64)) \gset structured_json_
select case when :'structured_json_classification'='structured' then 1 else 1/0 end;
select * from api.import_mapping_attach(:'structured_json_id'::uuid,
  '{"mappingVersion":"structured-json/1","sourceNamespace":"synthetic-v1","dateInterpretation":"explicit_only","columns":{"id":"externalId","name":"displayName"}}'::jsonb) \gset mapping_
select * from api.import_mapping_attach(:'structured_json_id'::uuid,
  '{"mappingVersion":"structured-json/1","sourceNamespace":"synthetic-v1","dateInterpretation":"explicit_only","columns":{"id":"externalId","name":"displayName"}}'::jsonb) \gset mapping_replay_
select case when :'mapping_version'=:'mapping_replay_version' then 1 else 1/0 end;
select format('do $body$ begin begin perform * from api.import_mapping_attach(%L::uuid,%L::jsonb); raise exception ''mapping snapshot changed after attachment''; exception when sqlstate ''P0008'' then null; end; end $body$;',
  :'structured_json_id', '{"mappingVersion":"structured-json/1","sourceNamespace":"synthetic-v1","dateInterpretation":"gregorian_dmy","columns":{"id":"externalId","name":"displayName"}}') \gexec
reset role;
select (select mapping_snapshot->>'mappingVersion'='structured-json/1' from private.import_jobs where id=:'structured_json_id'::uuid) as mapping_saved \gset mapping_snapshot_
\if :mapping_snapshot_mapping_saved
\else
  \quit 1
\endif
set local role authenticated;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-v1','v1','demo','b1640000-0000-4000-8000-000000000001',repeat('c',64)) \gset replay_
select case when :'replay_id'=:'job_id' and :'replay_version'=:'job_version' then 1 else 1/0 end;
select * from api.import_stage_rows(:'job_id'::uuid,
  '[{"rowNumber":1,"externalId":"synthetic-1","rawPayload":{"birthDate":"circa 1940"},"normalized":{"externalId":"synthetic-1","displayName":"Fictional Person"},"status":"valid","errors":[]},{"rowNumber":2,"externalId":"synthetic-1","rawPayload":{"name":"duplicate"},"normalized":null,"status":"review","errors":["duplicate_external_id_in_source"]},{"rowNumber":3,"externalId":"row-3","rawPayload":{"displayName":""},"normalized":null,"status":"invalid","errors":["displayName"]}]'::jsonb,
  '["duplicate_external_ids_require_review"]'::jsonb) \gset preview_
select case when :'preview_status'='needs_review' and :'preview_valid'='1' and :'preview_invalid'='1' and :'preview_possible_duplicates'='1' and length(:'preview_snapshot_hash')=64 then 1 else 1/0 end;
reset role;
select canonical_id as canonical_id from private.external_id_map where tree_id='b1610000-0000-4000-8000-000000000001' and source_namespace='synthetic-v1' and external_id='synthetic-1' and entity_kind='person' \gset stable_id_
set local role authenticated;
select * from api.import_stage_rows(:'job_id'::uuid,
  '[{"rowNumber":1,"externalId":"synthetic-1","rawPayload":{"birthDate":"circa 1940"},"normalized":{"externalId":"synthetic-1","displayName":"Fictional Person"},"status":"valid","errors":[]},{"rowNumber":2,"externalId":"synthetic-1","rawPayload":{"name":"duplicate"},"normalized":null,"status":"review","errors":["duplicate_external_id_in_source"]},{"rowNumber":3,"externalId":"row-3","rawPayload":{"displayName":""},"normalized":null,"status":"invalid","errors":["displayName"]}]'::jsonb,
  '["duplicate_external_ids_require_review"]'::jsonb) \gset stage_replay_
select case when :'stage_replay_version'=:'preview_version' and :'stage_replay_snapshot_hash'=:'preview_snapshot_hash' then 1 else 1/0 end;
reset role;
select (canonical_id=:'stable_id_canonical_id'::uuid and (select count(*) from private.external_id_map where tree_id='b1610000-0000-4000-8000-000000000001' and source_namespace='synthetic-v1' and external_id='synthetic-1' and entity_kind='person')=1) as external_map_stable from private.external_id_map where tree_id='b1610000-0000-4000-8000-000000000001' and source_namespace='synthetic-v1' and external_id='synthetic-1' and entity_kind='person' \gset stable_check_
\if :stable_check_external_map_stable
\else
  \quit 1
\endif
set local role authenticated;
select ((preview->>'valid')='1' and jsonb_array_length(preview->'sampleRows')=3
  and preview->>'fileSha256'=repeat('a',64) and not ((preview->'sampleRows'->0) ? 'rawPayload')) as preview_safe
from (select api.import_preview(:'job_id'::uuid) as preview) result \gset preview_
\if :preview_preview_safe
\else
  \quit 1
\endif
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
select format('do $body$ begin begin perform * from api.import_mapping_attach(%L::uuid,%L::jsonb); raise exception ''member without import grant attached mapping''; exception when insufficient_privilege then null; end; end $body$;',
  :'structured_json_id', '{"mappingVersion":"structured-json/1","sourceNamespace":"synthetic-v1","dateInterpretation":"explicit_only","columns":{"id":"externalId","name":"displayName"}}') \gexec
select format('do $body$ begin begin perform api.import_preview(%L::uuid); raise exception ''member without import grant could read preview''; exception when insufficient_privilege then null; end; end $body$;', :'job_id') \gexec
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
-- Independent MFA review and atomic person/source/citation apply in demo mode.
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-v1','synthetic-apply/1','demo','b1640000-0000-4000-8000-000000000010',repeat('7',64)) \gset apply_job_
select * from api.import_stage_rows(:'apply_job_id'::uuid,
  '[{"rowNumber":1,"externalId":"synthetic-apply-person","rawPayload":{"displayName":"Hư cấu Nguyễn An","birthDate":{"calendar":"gregorian","precision":"year","year":1901,"originalText":"1901"}},"normalized":{"externalId":"synthetic-apply-person","displayName":"Hư cấu Nguyễn An","birthDate":{"calendar":"gregorian","precision":"year","year":1901,"originalText":"1901"},"notes":"Ghi chú tổng hợp","gender":"U"},"status":"valid","errors":[]}]'::jsonb,'[]'::jsonb) \gset apply_stage_
select format('do $body$ begin begin perform api.import_approve(%L::uuid,%L::bigint,%L,%L::uuid,%L); raise exception ''creator self-review accepted''; exception when insufficient_privilege then null; end; end $body$;',
  :'apply_job_id',:'apply_stage_version',:'apply_stage_snapshot_hash','b1640000-0000-4000-8000-000000000012',repeat('1',64)) \gexec
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select format('do $body$ begin begin perform api.import_approve(%L::uuid,%L::bigint,%L,%L::uuid,%L); raise exception ''AAL1 review accepted''; exception when insufficient_privilege then null; end; end $body$;',
  :'apply_job_id',:'apply_stage_version',:'apply_stage_snapshot_hash','b1640000-0000-4000-8000-000000000012',repeat('1',64)) \gexec
reset role;
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select format('do $body$ begin begin perform api.import_approve(%L::uuid,%L::bigint,%L,%L::uuid,%L); raise exception ''stale preview accepted''; exception when serialization_failure then null; end; end $body$;',
  :'apply_job_id',:'apply_stage_version',repeat('0',64),'b1640000-0000-4000-8000-000000000012',repeat('1',64)) \gexec
select result->'job'->>'version' as version,result->'job'->>'status' as status,result->>'approvalId' as approval_id
  from (select api.import_approve(:'apply_job_id'::uuid,:'apply_stage_version'::bigint,:'apply_stage_snapshot_hash',
    'b1640000-0000-4000-8000-000000000012',repeat('1',64)) as result) r \gset approval_
select case when :'approval_status'='ready' and length(:'approval_approval_id')=36 then 1 else 1/0 end;
select api.import_approve(:'apply_job_id'::uuid,:'apply_stage_version'::bigint,:'apply_stage_snapshot_hash',
    'b1640000-0000-4000-8000-000000000012',repeat('1',64))->>'approvalId'=:'approval_approval_id' as stable_approval \gset approval_replay_
\if :approval_replay_stable_approval
\else
  \quit 1
\endif
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select format('do $body$ begin begin update private.import_rows set raw_payload=''{}''::jsonb where job_id=%L::uuid; perform api.import_commit(%L::uuid,%L::bigint,%L,%L::uuid,%L::uuid,%L); raise exception ''changed staging applied''; exception when serialization_failure then null; end; end $body$;',
  :'apply_job_id',:'apply_job_id',:'approval_version',:'apply_stage_snapshot_hash',:'approval_approval_id','b1640000-0000-4000-8000-000000000011',repeat('8',64)) \gexec
set local role authenticated;
select result->>'status' as status,result->'counters'->>'succeeded' as applied_people
  from (select api.import_commit(:'apply_job_id'::uuid,:'approval_version'::bigint,:'apply_stage_snapshot_hash',:'approval_approval_id'::uuid,
  'b1640000-0000-4000-8000-000000000011',repeat('8',64)) as result) r \gset applied_
select case when :'applied_status'='completed' and :'applied_applied_people'='1' then 1 else 1/0 end;
reset role;
select (select count(*)=1 from private.persons where tree_id='b1610000-0000-4000-8000-000000000001' and display_name='Hư cấu Nguyễn An')
  and (select count(*)=1 from private.citations where tree_id='b1610000-0000-4000-8000-000000000001' and person_id=(select id from private.persons where tree_id='b1610000-0000-4000-8000-000000000001' and display_name='Hư cấu Nguyễn An'))
  and (select count(*)=1 from private.person_facts where tree_id='b1610000-0000-4000-8000-000000000001' and kind='birth' and value_date='{"calendar":"gregorian","precision":"year","year":1901,"originalText":"1901"}'::jsonb)
  as import_apply_preserves_provenance_and_date \gset applied_check_
\if :applied_check_import_apply_preserves_provenance_and_date
\else
  \quit 1
\endif
set local role authenticated;
select result->>'status' as status,result->'counters'->>'succeeded' as applied_people
  from (select api.import_commit(:'apply_job_id'::uuid,:'approval_version'::bigint,:'apply_stage_snapshot_hash',:'approval_approval_id'::uuid,
  'b1640000-0000-4000-8000-000000000011',repeat('8',64)) as result) r \gset applied_replay_
select case when :'applied_replay_status'='completed' and :'applied_replay_applied_people'='1' then 1 else 1/0 end;
select format('do $body$ begin begin perform api.import_commit(%L::uuid,%L::bigint,%L,%L::uuid,%L::uuid,%L); raise exception ''changed retry request accepted''; exception when sqlstate ''P0008'' then null; end; end $body$;',
  :'apply_job_id',:'approval_version',:'apply_stage_snapshot_hash',:'approval_approval_id','b1640000-0000-4000-8000-000000000011',repeat('9',64)) \gexec
-- Exercise the documented atomic capacity rather than assuming 2000-row safety.
-- Reversible row decisions preserve parser/raw data and invalidate review.
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-row-decisions','decisions/1','demo',
  'b1640000-0000-4000-8000-000000000030',repeat('5',64)) \gset decision_job_
select * from api.import_stage_rows(:'decision_job_id'::uuid,
  '[{"rowNumber":1,"externalId":"decision-1","rawPayload":{"note":"Private original unchanged"},"normalized":{"externalId":"decision-1","displayName":"Hư cấu quyết định dòng"},"status":"valid","errors":[]},{"rowNumber":2,"externalId":"decision-2","rawPayload":{"original":"Missing name"},"normalized":null,"status":"invalid","errors":["displayName"]}]'::jsonb,'[]'::jsonb) \gset decision_stage_
select result->>'version' as version,result->>'snapshotHash' as hash,result->>'invalid' as invalid,result->>'excluded' as excluded
  from (select api.import_row_decide(:'decision_job_id'::uuid,:'decision_stage_version'::bigint,:'decision_stage_snapshot_hash',2,true,'Hư cấu: thiếu tên nguồn',
    'b1640000-0000-4000-8000-000000000031',repeat('6',64)) as result) r \gset decision_exclude_
select case when :'decision_exclude_invalid'='0' and :'decision_exclude_excluded'='1' and :'decision_exclude_hash'<>:'decision_stage_snapshot_hash' then 1 else 1/0 end;
select result->>'version' as version from (select api.import_row_decide(:'decision_job_id'::uuid,:'decision_stage_version'::bigint,:'decision_stage_snapshot_hash',2,true,'Hư cấu: thiếu tên nguồn',
    'b1640000-0000-4000-8000-000000000031',repeat('6',64)) as result) r \gset decision_replay_
select case when :'decision_replay_version'=:'decision_exclude_version' then 1 else 1/0 end;
select format('do $body$ begin begin perform api.import_row_decide(%L::uuid,%L::bigint,%L,2,false,%L,%L::uuid,%L); raise exception ''changed row retry accepted''; exception when sqlstate ''P0008'' then null; end; end $body$;',
  :'decision_job_id',:'decision_stage_version',:'decision_stage_snapshot_hash','Hư cấu: thiếu tên nguồn','b1640000-0000-4000-8000-000000000031',repeat('6',64)) \gexec
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select result->'job'->>'version' as version,result->>'approvalId' as approval_id
  from (select api.import_approve(:'decision_job_id'::uuid,:'decision_exclude_version'::bigint,:'decision_exclude_hash',
    'b1640000-0000-4000-8000-000000000032',repeat('7',64)) as result) r \gset decision_approval_
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select result->>'version' as version,result->>'snapshotHash' as hash,result->>'invalid' as invalid,result->>'excluded' as excluded
  from (select api.import_row_decide(:'decision_job_id'::uuid,:'decision_approval_version'::bigint,:'decision_exclude_hash',2,false,'Hư cấu: khôi phục để đối chiếu',
    'b1640000-0000-4000-8000-000000000033',repeat('8',64)) as result) r \gset decision_restore_
select case when :'decision_restore_invalid'='1' and :'decision_restore_excluded'='0' then 1 else 1/0 end;
select (api.import_job_state(:'decision_job_id'::uuid)->>'approvalId' is null) as revoked \gset decision_state_
\if :decision_state_revoked
\else
  \quit 1
\endif
select format('do $body$ begin begin perform api.import_commit(%L::uuid,%L::bigint,%L,%L::uuid,%L::uuid,%L); raise exception ''stale approval accepted after row restore''; exception when sqlstate ''40001'' then null; end; end $body$;',
  :'decision_job_id',:'decision_approval_version',:'decision_exclude_hash',:'decision_approval_approval_id','b1640000-0000-4000-8000-000000000034',repeat('9',64)) \gexec
select result->>'version' as version,result->>'snapshotHash' as hash
  from (select api.import_row_decide(:'decision_job_id'::uuid,:'decision_restore_version'::bigint,:'decision_restore_hash',2,true,'Hư cấu: loại dòng chưa đủ nguồn',
    'b1640000-0000-4000-8000-000000000035',repeat('a',64)) as result) r \gset decision_final_
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select result->'job'->>'version' as version,result->>'approvalId' as approval_id
  from (select api.import_approve(:'decision_job_id'::uuid,:'decision_final_version'::bigint,:'decision_final_hash',
    'b1640000-0000-4000-8000-000000000036',repeat('b',64)) as result) r \gset decision_final_approval_
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select result->>'status'='completed' and result->'counters'->>'succeeded'='1' and result->'counters'->>'skipped'='1' as complete
  from (select api.import_commit(:'decision_job_id'::uuid,:'decision_final_approval_version'::bigint,:'decision_final_hash',:'decision_final_approval_approval_id'::uuid,
    'b1640000-0000-4000-8000-000000000037',repeat('c',64)) as result) r \gset decision_apply_
\if :decision_apply_complete
\else
  \quit 1
\endif
reset role;
select (select count(*) from private.import_rows where job_id=:'decision_job_id'::uuid and status='invalid' and raw_payload->>'original'='Missing name')=1
  and (select jsonb_array_length(manifest->'appliedEntities') from private.import_jobs where id=:'decision_job_id'::uuid)=1 as original_and_manifest \gset decision_integrity_
\if :decision_integrity_original_and_manifest
\else
  \quit 1
\endif
set local role authenticated;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','canonical_json','synthetic-load','capacity/1','demo',
  'b1640000-0000-4000-8000-000000000020',repeat('2',64)) \gset capacity_job_
select * from api.import_stage_rows(:'capacity_job_id'::uuid,
  (select jsonb_agg(jsonb_build_object('rowNumber',n,'externalId','load-'||n,'rawPayload',jsonb_build_object('displayName','Hư cấu capacity '||n),
    'normalized',jsonb_build_object('externalId','load-'||n,'displayName','Hư cấu capacity '||n),'status','valid','errors','[]'::jsonb) order by n)
    from generate_series(1,2000) n),'[]'::jsonb) \gset capacity_stage_
select api.import_rows_page(:'capacity_job_id'::uuid,:'capacity_stage_version'::bigint,0) as value \gset inspection_first_
select jsonb_array_length(:'inspection_first_value'::jsonb->'rows')=50
  and :'inspection_first_value'::jsonb->>'nextCursor'='50'
  and not (:'inspection_first_value'::jsonb->'rows'->0 ? 'rawPayload') as safe \gset inspection_check_
\if :inspection_check_safe
\else
  \quit 1
\endif
select api.import_rows_page(:'capacity_job_id'::uuid,:'capacity_stage_version'::bigint,50) as value \gset inspection_second_
select :'inspection_second_value'::jsonb->'rows'->0->>'rowNumber'='51' and :'inspection_second_value'::jsonb->>'nextCursor'='100' as safe \gset inspection_check_
\if :inspection_check_safe
\else
  \quit 1
\endif
select api.import_rows_page(:'capacity_job_id'::uuid,:'capacity_stage_version'::bigint,1950) as value \gset inspection_last_
select jsonb_array_length(:'inspection_last_value'::jsonb->'rows')=50 and :'inspection_last_value'::jsonb->>'nextCursor' is null as safe \gset inspection_check_
\if :inspection_check_safe
\else
  \quit 1
\endif
select format('do $body$ begin begin perform api.import_rows_page(%L::uuid,%L::bigint,0); raise exception ''stale inspection accepted''; exception when sqlstate ''40001'' then null; end; end $body$;',
  :'capacity_job_id',(:'capacity_stage_version'::bigint+1)::text) \gexec
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select result->'job'->>'version' as version,result->>'approvalId' as approval_id
  from (select api.import_approve(:'capacity_job_id'::uuid,:'capacity_stage_version'::bigint,:'capacity_stage_snapshot_hash',
    'b1640000-0000-4000-8000-000000000021',repeat('3',64)) as result) r \gset capacity_approval_
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select result->>'status'='completed' and result->'counters'->>'succeeded'='2000' as complete
  from (select api.import_commit(:'capacity_job_id'::uuid,:'capacity_approval_version'::bigint,:'capacity_stage_snapshot_hash',:'capacity_approval_approval_id'::uuid,
    'b1640000-0000-4000-8000-000000000022',repeat('4',64)) as result) r \gset capacity_apply_
\if :capacity_apply_complete
\else
  \quit 1
\endif
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001','gedcom_551','synthetic-relationships','relationship/1','demo',
  'b1640000-0000-4000-8000-000000000023',repeat('f',64)) \gset relationship_job_
select * from api.import_stage_rows(:'relationship_job_id'::uuid,
  '[{"rowNumber":1,"externalId":"F1","rawPayload":{"recordType":"FAM"},"normalized":{"recordType":"FAM","externalId":"F1","partnerRefs":[{"xref":"I1","sourceTag":"HUSB"}],"childRefs":["I2"]},"status":"review","errors":["relationship_mapping_requires_review"]},
    {"rowNumber":2,"externalId":"I1","rawPayload":{"recordType":"INDI"},"normalized":{"recordType":"INDI","externalId":"I1","displayName":"Hư cấu người A"},"status":"review","errors":["relationship_mapping_requires_review"]},
    {"rowNumber":3,"externalId":"I2","rawPayload":{"recordType":"INDI"},"normalized":{"recordType":"INDI","externalId":"I2","displayName":"Hư cấu người B"},"status":"review","errors":["relationship_mapping_requires_review"]}]'::jsonb,'[]'::jsonb) \gset relationship_stage_
reset role;
select count(*) as n from private.parent_links where tree_id='b1610000-0000-4000-8000-000000000001' \gset before_relationship_
set local role authenticated;
select result->>'version' as version,result->>'snapshotHash' as hash,result->>'mappingCount' as count
  from (select api.import_relationship_mapping_save(:'relationship_job_id'::uuid,:'relationship_stage_version'::bigint,:'relationship_stage_snapshot_hash',
    jsonb_build_object('baseVersion',:'relationship_stage_version'::bigint,'snapshotHash',:'relationship_stage_snapshot_hash',
      'familyExternalId','F1','partnerExternalIds',jsonb_build_array('I1'),'childExternalIds',jsonb_build_array('I2'),
      'parentLinks',jsonb_build_array(jsonb_build_object('parentExternalId','I1','childExternalId','I2','kind','biological','status','disputed')),
      'reason','Hư cấu: đối chiếu nguồn GEDCOM'),
    'b1640000-0000-4000-8000-000000000024',repeat('5',64)) as result) r \gset relationship_saved_
reset role;
select :'relationship_saved_count'='1' as count_ok, :'relationship_saved_hash'<>:'relationship_stage_snapshot_hash' as hash_ok,
  (select count(*)=1 from private.import_relationship_mappings where job_id=:'relationship_job_id'::uuid) as mapping_ok,
  (select count(*)=:'before_relationship_n'::bigint from private.parent_links where tree_id='b1610000-0000-4000-8000-000000000001') as links_ok \gset relassert_
\echo relassert :relassert_count_ok :relassert_hash_ok :relassert_mapping_ok :relassert_links_ok
select case when :'relassert_count_ok'='t' and :'relassert_hash_ok'='t' and :'relassert_mapping_ok'='t' and :'relassert_links_ok'='t' then 1 else 1/0 end;
set local role authenticated;
select result->>'version' as version from (select api.import_relationship_mapping_save(:'relationship_job_id'::uuid,:'relationship_stage_version'::bigint,:'relationship_stage_snapshot_hash',
    jsonb_build_object('baseVersion',:'relationship_stage_version'::bigint,'snapshotHash',:'relationship_stage_snapshot_hash',
      'familyExternalId','F1','partnerExternalIds',jsonb_build_array('I1'),'childExternalIds',jsonb_build_array('I2'),
      'parentLinks',jsonb_build_array(jsonb_build_object('parentExternalId','I1','childExternalId','I2','kind','biological','status','disputed')),
      'reason','Hư cấu: đối chiếu nguồn GEDCOM'),
    'b1640000-0000-4000-8000-000000000024',repeat('5',64)) as result) r \gset relationship_replay_
select case when :'relationship_replay_version'=:'relationship_saved_version' then 1 else 1/0 end;
select api.import_relationship_rows(:'relationship_job_id'::uuid,:'relationship_saved_version'::bigint,0) as value \gset relationship_page_
select case when jsonb_array_length(:'relationship_page_value'::jsonb->'families')=1
  and :'relationship_page_value'::jsonb->'families'->0->'partners'->0->>'relationshipOnlyReview'='true'
  and :'relationship_page_value'::jsonb->'families'->0->'savedMapping'->'parentLinks'->0->>'status'='disputed'
  and not (:'relationship_page_value'::jsonb->'families'->0 ? 'rawPayload')
  and not (:'relationship_page_value'::jsonb->'families'->0 ? 'reason') then 1 else 1/0 end;
select format('do $body$ begin begin perform api.import_relationship_mapping_save(%L::uuid,%L::bigint,%L,%L::jsonb,%L::uuid,%L); raise exception ''stale relationship snapshot accepted''; exception when sqlstate ''40001'' then null; end; end $body$;',
  :'relationship_job_id',:'relationship_stage_version',:'relationship_stage_snapshot_hash',
  jsonb_build_object('baseVersion',:'relationship_stage_version'::bigint,'snapshotHash',:'relationship_stage_snapshot_hash',
    'familyExternalId','F1','partnerExternalIds',jsonb_build_array('I1'),'childExternalIds',jsonb_build_array('I2'),'parentLinks','[]'::jsonb,'reason','Hư cấu retry')::text,
  'b1640000-0000-4000-8000-000000000025',repeat('6',64)) \gexec
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
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
