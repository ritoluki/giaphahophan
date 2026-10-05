-- Runs inside the synthetic rollback transaction from m16_import_staging.sql.
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001',
  'canonical_json','synthetic-chunks','chunks/1','demo',gen_random_uuid(),repeat('a',64)) \gset chunk_job_
select * from api.import_stage_rows(:'chunk_job_id'::uuid,
  (select jsonb_agg(jsonb_build_object('rowNumber',n,'externalId','chunk-'||n,'rawPayload',jsonb_build_object('demo',true),
    'normalized',jsonb_build_object('externalId','chunk-'||n,'displayName','Hư cấu chunk '||n),
    'status','valid','errors','[]'::jsonb) order by n) from generate_series(1,2501) n),'[]'::jsonb) \gset chunk_stage_
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select api.import_approve(:'chunk_job_id'::uuid,:'chunk_stage_version'::bigint,:'chunk_stage_snapshot_hash',gen_random_uuid(),repeat('b',64)) value \gset chunk_approved_
select :'chunk_approved_value'::jsonb->'job'->>'version' version,:'chunk_approved_value'::jsonb->>'approvalId' approval \gset chunk_base_
-- The reviewer still cannot apply their own approval.
select format('do $b$ begin begin perform api.import_chunk_apply(%L::uuid,%L::bigint,%L,%L::uuid,1,gen_random_uuid(),%L); raise exception ''reviewer applied''; exception when insufficient_privilege then null; end; end $b$;',
  :'chunk_job_id',:'chunk_base_version',:'chunk_stage_snapshot_hash',:'chunk_base_approval',repeat('c',64)) \gexec
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select format('do $b$ begin begin perform api.import_commit(%L::uuid,%L::bigint,%L,%L::uuid,gen_random_uuid(),%L); raise exception ''large atomic batch applied''; exception when sqlstate ''22023'' then null; end; end $b$;',
  :'chunk_job_id',:'chunk_base_version',:'chunk_stage_snapshot_hash',:'chunk_base_approval',repeat('c',64)) \gexec
select api.import_chunk_apply(:'chunk_job_id'::uuid,:'chunk_base_version'::bigint,:'chunk_stage_snapshot_hash',:'chunk_base_approval'::uuid,1,
  'b1650000-0000-4000-8000-000000000001',repeat('c',64)) value \gset chunk_first_
select case when :'chunk_first_value'::jsonb->'job'->>'status'='partially_applied'
  and :'chunk_first_value'::jsonb->>'appliedPeople'='500' and :'chunk_first_value'::jsonb->'chunkProgress'->>'total'='6'
  and :'chunk_first_value'::jsonb->'chunkProgress'->>'committed'='1' then 1 else 1/0 end;
select format('do $b$ begin begin perform api.import_chunk_apply(%L::uuid,%L::bigint,%L,%L::uuid,1,%L::uuid,%L); raise exception ''changed replay accepted''; exception when sqlstate ''P0008'' then null; end; end $b$;',
  :'chunk_job_id',:'chunk_base_version',:'chunk_stage_snapshot_hash',:'chunk_base_approval','b1650000-0000-4000-8000-000000000001',repeat('d',64)) \gexec
select format('do $b$ begin begin perform api.import_chunk_apply(%L::uuid,%L::bigint,%L,%L::uuid,2,gen_random_uuid(),%L); raise exception ''stale version accepted''; exception when sqlstate ''40001'' then null; end; end $b$;',
  :'chunk_job_id',:'chunk_base_version',:'chunk_stage_snapshot_hash',:'chunk_base_approval',repeat('d',64)) \gexec
select (:'chunk_first_value'::jsonb->'job'->>'version')::bigint version \gset chunk_second_
select format('do $b$ begin begin perform api.import_chunk_apply(%L::uuid,%L::bigint,%L,%L::uuid,3,gen_random_uuid(),%L); raise exception ''out-of-order accepted''; exception when sqlstate ''40001'' then null; end; end $b$;',
  :'chunk_job_id',:'chunk_second_version',:'chunk_stage_snapshot_hash',:'chunk_base_approval',repeat('d',64)) \gexec
reset role;
savepoint chunk_edit;
update private.persons set display_name='Hư cấu: changed after chunk' where id in(
  select m.canonical_id from private.external_id_map m where m.source_namespace='synthetic-chunks' and m.external_id='chunk-1');
set local role authenticated;
select format('do $b$ begin begin perform api.import_chunk_apply(%L::uuid,%L::bigint,%L,%L::uuid,2,gen_random_uuid(),%L); raise exception ''changed owned person accepted''; exception when sqlstate ''40001'' then null; end; end $b$;',
  :'chunk_job_id',:'chunk_second_version',:'chunk_stage_snapshot_hash',:'chunk_base_approval',repeat('d',64)) \gexec
reset role;
rollback to chunk_edit;
savepoint chunk_collision;
insert into private.persons(id,tree_id,created_by,code,display_name,name_search)
  select m.canonical_id,m.tree_id,'b1600000-0000-4000-8000-000000000001','SYNTHETIC-CHUNK-COLLISION','Hư cấu collision','hu cau collision'
    from private.external_id_map m where m.source_namespace='synthetic-chunks' and m.external_id='chunk-750';
set local role authenticated;
select format('do $b$ begin begin perform api.import_chunk_apply(%L::uuid,%L::bigint,%L,%L::uuid,2,gen_random_uuid(),%L); raise exception ''collision accepted''; exception when unique_violation then null; end; end $b$;',
  :'chunk_job_id',:'chunk_second_version',:'chunk_stage_snapshot_hash',:'chunk_base_approval',repeat('d',64)) \gexec
reset role;
select (select count(*) from private.import_owned_rows where job_id=:'chunk_job_id'::uuid and table_name='persons')=500
  and (select count(*) from private.import_chunks where job_id=:'chunk_job_id'::uuid and status='completed')=1 as preserved \gset chunk_collision_
\if :chunk_collision_preserved
\else
  \quit 1
\endif
rollback to chunk_collision;
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select format('do $b$ begin begin perform api.import_chunk_apply(%L::uuid,%L::bigint,%L,%L::uuid,2,gen_random_uuid(),%L); raise exception ''AAL1 accepted''; exception when insufficient_privilege then null; end; end $b$;',
  :'chunk_job_id',:'chunk_second_version',:'chunk_stage_snapshot_hash',:'chunk_base_approval',repeat('d',64)) \gexec
reset role;
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select format('do $b$ declare v bigint:=%L::bigint; r jsonb; n integer; begin for n in 2..6 loop
 r:=api.import_chunk_apply(%L::uuid,v,%L,%L::uuid,n,gen_random_uuid(),%L); v:=(r->''job''->>''version'')::bigint;
 end loop; if r->''job''->>''status''<>''completed'' or r->>''appliedPeople''<>''2501'' or r->''chunkProgress''->>''committed''<>''6'' then raise exception ''chunk completion mismatch''; end if; end $b$;',
  :'chunk_second_version',:'chunk_job_id',:'chunk_stage_snapshot_hash',:'chunk_base_approval',repeat('e',64)) \gexec
select api.import_chunk_apply(:'chunk_job_id'::uuid,:'chunk_base_version'::bigint,:'chunk_stage_snapshot_hash',:'chunk_base_approval'::uuid,1,
  'b1650000-0000-4000-8000-000000000001',repeat('c',64))=:'chunk_first_value'::jsonb as exact_replay \gset chunk_replay_
select case when :'chunk_replay_exact_replay'='t' then 1 else 1/0 end;

-- Cancellation after progress keeps the committed people and their private source.
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001',
  'canonical_json','synthetic-chunk-cancel','chunks/cancel','demo',gen_random_uuid(),repeat('a',64)) \gset partial_job_
select * from api.import_stage_rows(:'partial_job_id'::uuid,
  (select jsonb_agg(jsonb_build_object('rowNumber',n,'externalId','partial-'||n,'rawPayload',jsonb_build_object('demo',true),
    'normalized',jsonb_build_object('externalId','partial-'||n,'displayName','Hư cấu partial '||n),'status','valid','errors','[]'::jsonb) order by n)
    from generate_series(1,1001) n),'[]'::jsonb) \gset partial_stage_
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select api.import_approve(:'partial_job_id'::uuid,:'partial_stage_version'::bigint,:'partial_stage_snapshot_hash',gen_random_uuid(),repeat('b',64)) value \gset partial_approved_
select :'partial_approved_value'::jsonb->'job'->>'version' version,:'partial_approved_value'::jsonb->>'approvalId' approval \gset partial_base_
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select api.import_chunk_apply(:'partial_job_id'::uuid,:'partial_base_version'::bigint,:'partial_stage_snapshot_hash',:'partial_base_approval'::uuid,1,
  'b1650000-0000-4000-8000-000000000002',repeat('c',64)) value \gset partial_first_
select api.import_cancel(:'partial_job_id'::uuid,(:'partial_first_value'::jsonb->'job'->>'version')::bigint,'Hư cấu: cancel after progress',
  'b1650000-0000-4000-8000-000000000003',repeat('d',64)) value \gset partial_cancel_
select case when :'partial_cancel_value'::jsonb->'job'->>'status'='cancelled' and :'partial_cancel_value'::jsonb->>'appliedPeople'='500'
  and :'partial_cancel_value'::jsonb->'chunkProgress'->>'committed'='1' and :'partial_cancel_value'::jsonb->'chunkProgress'->'nextSequence'='null'::jsonb
  and :'partial_cancel_value'::jsonb->>'canApplyChunk'='false' then 1 else 1/0 end;
select format('do $b$ begin begin perform api.import_chunk_apply(%L::uuid,%L::bigint,%L,%L::uuid,2,gen_random_uuid(),%L); raise exception ''cancelled continuation accepted''; exception when sqlstate ''40001'' then null; end; end $b$;',
  :'partial_job_id',(:'partial_cancel_value'::jsonb->'job'->>'version'),:'partial_stage_snapshot_hash',:'partial_base_approval',repeat('e',64)) \gexec
reset role;
select (select count(*) from private.import_owned_rows where job_id=:'partial_job_id'::uuid and table_name='persons')=500
  and (select count(*) from private.import_rows where job_id=:'partial_job_id'::uuid)=1001
  and exists(select 1 from private.sources where provider_name='synthetic-chunk-cancel') as preserved \gset partial_cancel_
\if :partial_cancel_preserved
\else
  \quit 1
\endif

-- Multi-family continuation exercises the guard against already-owned canonical links.
set local role authenticated;
select * from api.import_create('b1610000-0000-4000-8000-000000000001','b1630000-0000-4000-8000-000000000001',
  'gedcom_551','synthetic-chunk-families','chunks/family','demo',gen_random_uuid(),repeat('a',64)) \gset family_chunk_job_
select * from api.import_stage_rows(:'family_chunk_job_id'::uuid,
  '[{"rowNumber":1,"externalId":"F1","rawPayload":{},"normalized":{"recordType":"FAM","externalId":"F1","partnerRefs":[{"xref":"P1","sourceTag":"HUSB"}],"childRefs":["P2"]},"status":"review","errors":["relationship_mapping_requires_review"]},
    {"rowNumber":2,"externalId":"P1","rawPayload":{},"normalized":{"recordType":"INDI","externalId":"P1","displayName":"Hư cấu chunk cha","familySpouseRefs":["F1","F2"]},"status":"review","errors":["relationship_mapping_requires_review"]},
    {"rowNumber":3,"externalId":"P2","rawPayload":{},"normalized":{"recordType":"INDI","externalId":"P2","displayName":"Hư cấu chunk con","familyChildRefs":[{"xref":"F1"},{"xref":"F2"}]},"status":"review","errors":["relationship_mapping_requires_review"]},
    {"rowNumber":4,"externalId":"F2","rawPayload":{},"normalized":{"recordType":"FAM","externalId":"F2","partnerRefs":[{"xref":"P1","sourceTag":"HUSB"}],"childRefs":["P2"]},"status":"review","errors":["relationship_mapping_requires_review"]}]'::jsonb,'[]'::jsonb) \gset family_chunk_stage_
select format('do $b$ declare v bigint:=%L::bigint; h text:=%L; r jsonb; n integer; begin for n in 1..2 loop
 r:=api.import_relationship_mapping_save(%L::uuid,v,h,jsonb_build_object(''baseVersion'',v,''snapshotHash'',h,''familyExternalId'',''F''||n,
 ''partnerExternalIds'',jsonb_build_array(''P1''),''childExternalIds'',jsonb_build_array(''P2''),''parentLinks'',jsonb_build_array(jsonb_build_object(
 ''parentExternalId'',''P1'',''childExternalId'',''P2'',''kind'',case when n=1 then ''biological'' else ''guardian'' end,
 ''status'',case when n=1 then ''confirmed'' else ''disputed'' end)),''reason'',''Synthetic chunk review''),gen_random_uuid(),%L);
 v:=(r->>''version'')::bigint; h:=r->>''snapshotHash''; end loop; end $b$;',
  :'family_chunk_stage_version',:'family_chunk_stage_snapshot_hash',:'family_chunk_job_id',repeat('b',64)) \gexec
select api.import_job_state(:'family_chunk_job_id'::uuid) value \gset family_chunk_ready_
select api.import_preview(:'family_chunk_job_id'::uuid)->>'snapshotHash' hash \gset family_chunk_snapshot_
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select api.import_approve(:'family_chunk_job_id'::uuid,(:'family_chunk_ready_value'::jsonb->'job'->>'version')::bigint,:'family_chunk_snapshot_hash',
  gen_random_uuid(),repeat('c',64)) value \gset family_chunk_approved_
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select format('do $b$ declare v bigint:=%L::bigint; r jsonb; n integer; begin for n in 1..3 loop
 r:=api.import_chunk_apply(%L::uuid,v,%L,%L::uuid,n,gen_random_uuid(),%L); v:=(r->''job''->>''version'')::bigint;
 if n=1 and r->>''appliedUnions''<>''0'' then raise exception ''family written before people phase complete''; end if;
 end loop; if r->''job''->>''status''<>''completed'' or r->>''appliedUnions''<>''2'' or r->>''appliedParentLinks''<>''2'' then
 raise exception ''family chunk counts mismatch''; end if; end $b$;',
  (:'family_chunk_approved_value'::jsonb->'job'->>'version'),:'family_chunk_job_id',:'family_chunk_snapshot_hash',
  (:'family_chunk_approved_value'::jsonb->>'approvalId'),repeat('d',64)) \gexec
reset role;
