-- Separate compensation approval is required; imports never authorize their own undo.
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select api.import_job_state(:'family_chunk_job_id'::uuid) value \gset comp_base_
select (:'comp_base_value'::jsonb->'job'->>'version')::bigint version \gset comp_job_
select api.import_compensation(:'family_chunk_job_id'::uuid,'request',:'comp_job_version'::bigint,null,null,
  'Hư cấu: hoàn tác hai gia đình đã nhập',gen_random_uuid(),repeat('a',64)) value \gset comp_request_
select :'comp_request_value'::jsonb->'compensation'->>'id' id \gset comp_review_
select format('do $b$ begin begin perform api.import_compensation(%L::uuid,''approve'',%L::bigint,%L::uuid,1,null,gen_random_uuid(),%L);
 raise exception ''requester self-approved compensation''; exception when insufficient_privilege then null; end; end $b$;',
 :'family_chunk_job_id',:'comp_job_version',:'comp_review_id',repeat('b',64)) \gexec
select format('do $b$ begin begin perform api.import_compensation(%L::uuid,''commit'',%L::bigint,%L::uuid,1,null,gen_random_uuid(),%L);
 raise exception ''unapproved compensation applied''; exception when insufficient_privilege then null; end; end $b$;',
 :'family_chunk_job_id',:'comp_job_version',:'comp_review_id',repeat('b',64)) \gexec
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select api.import_compensation(:'family_chunk_job_id'::uuid,'approve',:'comp_job_version'::bigint,:'comp_review_id'::uuid,1,
  null,gen_random_uuid(),repeat('b',64)) value \gset comp_approved_
select case when :'comp_approved_value'::jsonb->'compensation'->>'status'='approved'
  and :'comp_approved_value'::jsonb->'compensation'->>'canCommit'='false' then 1 else 1/0 end;
reset role;
select set_config('request.jwt.claim.sub','b1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
savepoint comp_changed;
update private.persons set display_name='Hư cấu: sửa sau duyệt hoàn tác' where id in (
 select entity_id from private.import_owned_rows where job_id=:'family_chunk_job_id'::uuid and table_name='persons' limit 1);
set local role authenticated;
select format('do $b$ begin begin perform api.import_compensation(%L::uuid,''commit'',%L::bigint,%L::uuid,2,null,gen_random_uuid(),%L);
 raise exception ''compensation deleted subsequent edit''; exception when sqlstate ''40001'' then null; end; end $b$;',
 :'family_chunk_job_id',:'comp_job_version',:'comp_review_id',repeat('c',64)) \gexec
reset role;
rollback to comp_changed;
savepoint comp_reference;
insert into private.person_names(tree_id,created_by,person_id,name,name_search,kind,is_preferred)
 select tree_id,'b1600000-0000-4000-8000-000000000001',entity_id,'Hư cấu: alias mới','hu cau alias moi','alias',false
 from private.import_owned_rows where job_id=:'family_chunk_job_id'::uuid and table_name='persons' limit 1;
set local role authenticated;
select format('do $b$ begin begin perform api.import_compensation(%L::uuid,''commit'',%L::bigint,%L::uuid,2,null,gen_random_uuid(),%L);
 raise exception ''compensation deleted newly referenced person''; exception when sqlstate ''40001'' then null; end; end $b$;',
 :'family_chunk_job_id',:'comp_job_version',:'comp_review_id',repeat('c',64)) \gexec
reset role;
rollback to comp_reference;
savepoint comp_polymorphic;
with proposal as (
 insert into private.proposals(tree_id,created_by,kind,reason)
 values('b1610000-0000-4000-8000-000000000001','b1600000-0000-4000-8000-000000000001','correction','Synthetic compensation reference')
 returning id
)
insert into private.proposal_items(tree_id,created_by,proposal_id,target_kind,target_id,base_version,operation,field_changes)
 select o.tree_id,'b1600000-0000-4000-8000-000000000001',p.id,'person',o.entity_id,1,'update','{}'
 from proposal p cross join private.import_owned_rows o where o.job_id=:'family_chunk_job_id'::uuid and o.table_name='persons' limit 1;
set local role authenticated;
select format('do $b$ begin begin perform api.import_compensation(%L::uuid,''commit'',%L::bigint,%L::uuid,2,null,gen_random_uuid(),%L);
 raise exception ''polymorphic proposal reference was deleted''; exception when sqlstate ''40001'' then null; end; end $b$;',
 :'family_chunk_job_id',:'comp_job_version',:'comp_review_id',repeat('c',64)) \gexec
reset role;
rollback to comp_polymorphic;
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select format('do $b$ begin begin perform api.import_compensation(%L::uuid,''commit'',%L::bigint,%L::uuid,2,null,gen_random_uuid(),%L);
 raise exception ''AAL1 compensated''; exception when insufficient_privilege then null; end; end $b$;',
 :'family_chunk_job_id',:'comp_job_version',:'comp_review_id',repeat('c',64)) \gexec
reset role;
select set_config('request.jwt.claims','{"sub":"b1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select api.import_compensation(:'family_chunk_job_id'::uuid,'commit',:'comp_job_version'::bigint,:'comp_review_id'::uuid,2,null,
  'b1650000-0000-4000-8000-000000000004',repeat('c',64)) value \gset comp_done_
select case when :'comp_done_value'::jsonb->>'appliedPeople'='0' and :'comp_done_value'::jsonb->>'appliedUnions'='0'
  and :'comp_done_value'::jsonb->>'appliedParentLinks'='0' and :'comp_done_value'::jsonb->'compensation'->>'status'='completed'
  and :'comp_done_value'::jsonb->'compensation'->'counts'->>'people'='2' and :'comp_done_value'::jsonb->>'canRequestCompensation'='false' then 1 else 1/0 end;
select api.import_compensation(:'family_chunk_job_id'::uuid,'commit',:'comp_job_version'::bigint,:'comp_review_id'::uuid,2,null,
  'b1650000-0000-4000-8000-000000000004',repeat('c',64))=:'comp_done_value'::jsonb exact_replay \gset comp_replay_
select case when :'comp_replay_exact_replay'='t' then 1 else 1/0 end;
select format('do $b$ begin begin perform api.import_compensation(%L::uuid,''commit'',%L::bigint,%L::uuid,2,null,%L::uuid,%L);
 raise exception ''changed compensation replay accepted''; exception when sqlstate ''P0008'' then null; end; end $b$;',
 :'family_chunk_job_id',:'comp_job_version',:'comp_review_id','b1650000-0000-4000-8000-000000000004',repeat('d',64)) \gexec
reset role;
select not exists(select 1 from private.import_owned_rows o join private.persons p on p.id=o.entity_id
 where o.job_id=:'family_chunk_job_id'::uuid and o.table_name='persons')
 and not exists(select 1 from private.sources where provider_name='synthetic-chunk-families')
 and (select count(*) from private.import_rows where job_id=:'family_chunk_job_id'::uuid)=4
 and (select count(*) from private.external_id_map where source_namespace='synthetic-chunk-families')=4
 and exists(select 1 from private.media_assets where id='b1630000-0000-4000-8000-000000000001')
 as compensation_preserved_source \gset comp_proof_
\if :comp_proof_compensation_preserved_source
\else
  \quit 1
\endif
