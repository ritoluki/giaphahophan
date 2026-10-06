-- Synthetic local only. No output files are claimed by this metadata test.
begin;
-- Fixture convenience only; authorization still runs through the authenticated API.
create function pg_temp.export_request(p_tree uuid,p_format text,p_scope jsonb,p_purpose text,p_key uuid,p_hash text) returns jsonb
language sql security invoker as $$ select api.export_job_create_v1(p_tree,p_format,p_scope,p_purpose,p_key,p_hash,
  case when p_scope->>'kind'='personal' then 'self' else 'members' end,false); $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','e1600000-0000-4000-8000-000000000001','authenticated','authenticated','m16-export-owner@example.test','',now(),now(),now(),'{}','{}'),
('00000000-0000-0000-0000-000000000000','e1600000-0000-4000-8000-000000000002','authenticated','authenticated','m16-export-member@example.test','',now(),now(),now(),'{}','{}');
insert into auth.sessions(id,user_id,aal) values
('e1600000-0000-4000-8000-000000000011','e1600000-0000-4000-8000-000000000001','aal1'),
('e1600000-0000-4000-8000-000000000012','e1600000-0000-4000-8000-000000000001','aal2'),
('e1600000-0000-4000-8000-000000000021','e1600000-0000-4000-8000-000000000002','aal1'),
('e1600000-0000-4000-8000-000000000022','e1600000-0000-4000-8000-000000000002','aal2');
insert into private.trees(id,slug,name,data_mode) values
('e1610000-0000-4000-8000-000000000001','m16-export-demo','Synthetic Export','demo'),
('e1610000-0000-4000-8000-000000000002','m16-export-other','Synthetic Other','demo');
insert into private.persons(id,tree_id,code,display_name,name_search) values
('e1630000-0000-4000-8000-000000000001','e1610000-0000-4000-8000-000000000001','DEMO-EXPORT','Synthetic Personal','synthetic personal');
insert into private.memberships(id,tree_id,auth_user_id,role,status,person_id,approved_by) values
('e1620000-0000-4000-8000-000000000001','e1610000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','owner','active',null,'e1600000-0000-4000-8000-000000000001'),
('e1620000-0000-4000-8000-000000000002','e1610000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000002','member','active','e1630000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"e1600000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $$ begin
 begin perform pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"tree"}','Synthetic copy',gen_random_uuid(),repeat('a',64));
  raise exception 'AAL1 bulk accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e1600000-0000-4000-8000-000000000012"}',true);
select pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"tree"}','Synthetic copy','e1640000-0000-4000-8000-000000000001',repeat('a',64)) value \gset bulk_
select (:'bulk_value'::jsonb->>'id') id \gset job_
do $$ declare v_a jsonb; v_b jsonb; begin
 v_a:=pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"tree"}','Synthetic copy','e1640000-0000-4000-8000-000000000001',repeat('a',64));
 v_b:=pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"tree"}','Synthetic copy','e1640000-0000-4000-8000-000000000001',repeat('a',64));
 if v_a<>v_b or v_a->>'status'<>'queued' or v_a ? 'resultAssetId' or v_a ? 'requestedBy' or v_a ? 'purpose' then raise exception 'unsafe job projection/replay'; end if;
 begin perform pg_temp.export_request('e1610000-0000-4000-8000-000000000001','csv','{"kind":"tree"}','Changed copy','e1640000-0000-4000-8000-000000000001',repeat('b',64));
  raise exception 'changed replay accepted'; exception when sqlstate 'P0008' then null; end;
 begin perform pg_temp.export_request('e1610000-0000-4000-8000-000000000001','csv','{"kind":"tree"}','Synthetic copy','e1640000-0000-4000-8000-000000000001',repeat('a',64));
  raise exception 'counterfeit hash changed replay accepted'; exception when sqlstate 'P0008' then null; end;
 begin perform pg_temp.export_request('e1610000-0000-4000-8000-000000000002','json','{"kind":"tree"}','Other tree',gen_random_uuid(),repeat('a',64));
  raise exception 'cross tree accepted'; exception when insufficient_privilege then null; end;
 begin perform pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"tree","includePrivate":true}','Unsafe scope',gen_random_uuid(),repeat('a',64));
  raise exception 'extra scope accepted'; exception when invalid_parameter_value then null; end;
 perform pg_temp.export_request('e1610000-0000-4000-8000-000000000001','csv','{"kind":"tree"}','Synthetic copy',gen_random_uuid(),repeat('b',64));
 perform api.export_job_create_v1('e1610000-0000-4000-8000-000000000001','pdf','{"kind":"tree"}','Synthetic copy',gen_random_uuid(),repeat('c',64),'public',true);
 begin perform api.export_job_create_v1('e1610000-0000-4000-8000-000000000001','json','{"kind":"tree"}','Synthetic copy','e1640000-0000-4000-8000-000000000001',repeat('a',64),'members',true);
  raise exception 'changed media accepted with counterfeit hash'; exception when sqlstate 'P0008' then null; end;
 begin perform pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"tree"}','Quota fourth',gen_random_uuid(),repeat('d',64));
  raise exception 'quota fourth accepted'; exception when sqlstate 'P0010' then null; end;
end $$;
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"e1600000-0000-4000-8000-000000000022"}',true);
do $$ begin
 begin perform pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"tree"}','Member bulk',gen_random_uuid(),repeat('a',64));
  raise exception 'member bulk accepted'; exception when insufficient_privilege then null; end;
 begin perform pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"personal","personId":"e1630000-0000-4000-8000-000000000001"}','Unapproved copy',gen_random_uuid(),repeat('a',64));
  raise exception 'unapproved personal accepted'; exception when insufficient_privilege then null; end;
end $$;
select format('do $b$ begin begin perform api.export_job_state(%L::uuid); raise exception ''other actor read job''; exception when insufficient_privilege then null; end; end $b$;',:'job_id') \gexec
reset role;
insert into private.person_claims(tree_id,membership_id,person_id,status,created_by,reviewed_by,reason) values
('e1610000-0000-4000-8000-000000000001','e1620000-0000-4000-8000-000000000002','e1630000-0000-4000-8000-000000000001','approved','e1600000-0000-4000-8000-000000000002','e1600000-0000-4000-8000-000000000001','Synthetic approved scope');
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1","session_id":"e1600000-0000-4000-8000-000000000021"}',true);
set local role authenticated;
select pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"personal","personId":"e1630000-0000-4000-8000-000000000001"}','Approved personal copy',gen_random_uuid(),repeat('a',64)) value \gset personal_
select (:'personal_value'::jsonb->>'id') id \gset personal_job_
reset role;
update private.memberships set status='revoked' where id='e1620000-0000-4000-8000-000000000002';
set local role authenticated;
select format('do $b$ begin begin perform api.export_job_state(%L::uuid); raise exception ''revoked actor read job''; exception when insufficient_privilege then null; end; end $b$;',:'personal_job_id') \gexec
reset role;
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e1600000-0000-4000-8000-000000000012"}',true);
update private.trees set policy_version=policy_version+1 where id='e1610000-0000-4000-8000-000000000001';
set local role authenticated;
select format('do $b$ begin begin perform api.export_job_state(%L::uuid); raise exception ''changed policy read job''; exception when insufficient_privilege then null; end; end $b$;',:'job_id') \gexec
reset role;
update private.trees set policy_version=policy_version-1 where id='e1610000-0000-4000-8000-000000000001';
update private.export_jobs set expires_at=clock_timestamp()-interval '1 second' where id=:'job_id'::uuid;
set local role authenticated;
select format('do $b$ begin begin perform api.export_job_state(%L::uuid); raise exception ''expired job readable''; exception when insufficient_privilege then null; end; end $b$;',:'job_id') \gexec
reset role;
do $$ begin
 if has_table_privilege('authenticated','private.export_jobs','SELECT')
   or has_function_privilege('anon','api.export_job_create_v1(uuid,text,jsonb,text,uuid,text,text,boolean)','EXECUTE')
   or has_function_privilege('authenticated','api.export_job_create(uuid,text,jsonb,text,uuid,text)','EXECUTE') then raise exception 'direct/anonymous export grant'; end if;
 if (select count(*) from private.export_jobs where tree_id='e1610000-0000-4000-8000-000000000001')<>4 then raise exception 'job count/replay/quota mismatch'; end if;
 if exists(select 1 from private.export_jobs where tree_id='e1610000-0000-4000-8000-000000000001' and (result_asset_id is not null or status<>'queued')) then raise exception 'fabricated artifact or completion'; end if;
 if not exists(select 1 from private.export_jobs where tree_id='e1610000-0000-4000-8000-000000000001' and format='pdf' and audience='public' and include_media) then raise exception 'audience/media not persisted'; end if;
end $$;
rollback;
