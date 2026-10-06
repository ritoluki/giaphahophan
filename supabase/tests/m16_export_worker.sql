-- Synthetic-only worker/RPC/session/storage policy regression; outer runner rolls back.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
('00000000-0000-0000-0000-000000000000','e1700000-0000-4000-8000-000000000001','authenticated','authenticated','m16-worker-owner@example.test','',now(),now(),now(),'{}','{}'),
('00000000-0000-0000-0000-000000000000','e1700000-0000-4000-8000-000000000002','authenticated','authenticated','m16-worker-member@example.test','',now(),now(),now(),'{}','{}');
insert into auth.sessions(id,user_id,aal) values
('e1710000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000001','aal2'),
('e1710000-0000-4000-8000-000000000002','e1700000-0000-4000-8000-000000000001','aal2'),
('e1710000-0000-4000-8000-000000000003','e1700000-0000-4000-8000-000000000001','aal2'),
('e1710000-0000-4000-8000-000000000004','e1700000-0000-4000-8000-000000000001','aal2'),
('e1710000-0000-4000-8000-000000000005','e1700000-0000-4000-8000-000000000001','aal2'),
('e1710000-0000-4000-8000-000000000006','e1700000-0000-4000-8000-000000000002','aal2');
insert into private.trees(id,slug,name,data_mode) values('e1720000-0000-4000-8000-000000000001','m16-worker-demo','Synthetic Worker Tree','demo');
insert into private.memberships(id,tree_id,auth_user_id,role,status,approved_by) values
('e1730000-0000-4000-8000-000000000001','e1720000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000001','owner','active','e1700000-0000-4000-8000-000000000001'),
('e1730000-0000-4000-8000-000000000002','e1720000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000002','member','active','e1700000-0000-4000-8000-000000000001');
insert into private.capability_grants(tree_id,membership_id,created_by,capability) values
('e1720000-0000-4000-8000-000000000001','e1730000-0000-4000-8000-000000000002','e1700000-0000-4000-8000-000000000001','exports.bulk');

create function pg_temp.export_worker_make_job(p_actor uuid,p_session uuid,p_key uuid) returns jsonb
language plpgsql security invoker as $$
begin
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated','aal','aal2','session_id',p_session)::text,true);
  return api.export_job_create_v1('e1720000-0000-4000-8000-000000000001','json','{"kind":"tree"}',
    'Synthetic worker regression',p_key,repeat('a',64),'members',false);
end $$;
create function pg_temp.assert_worker_test(p_ok boolean,p_message text) returns void
language plpgsql as $$ begin if not coalesce(p_ok,false) then raise exception '%',p_message; end if; end $$;
create function pg_temp.assert_worker_download_denied(p_job_id uuid) returns void
language plpgsql as $$
begin
  begin perform api.export_download_manifest(p_job_id);
  exception when insufficient_privilege then return;
  end;
  raise exception 'different session downloaded another session-bound export';
end $$;

-- A valid session can claim one job, and projection is re-filtered inside the worker RPC.
set local role authenticated;
select pg_temp.export_worker_make_job('e1700000-0000-4000-8000-000000000001','e1710000-0000-4000-8000-000000000001','e1740000-0000-4000-8000-000000000001') result \gset valid_
select (:'valid_result'::jsonb->>'id') id \gset valid_
reset role;
set local role service_role;
select api.export_worker_claim('e1750000-0000-4000-8000-000000000001',120) result \gset claim_
select (:'claim_result'::jsonb->>'leaseId') lease_id \gset valid_
select api.export_worker_projection(:'valid_id'::uuid,'e1750000-0000-4000-8000-000000000001',:'valid_lease_id'::uuid) projection \gset worker_
select pg_temp.assert_worker_test(:'worker_projection'::jsonb->>'treeId'='e1720000-0000-4000-8000-000000000001'
  and jsonb_array_length(:'worker_projection'::jsonb->'people')=0,'worker projection context/redaction');
select jsonb_build_object('objectPath','e1720000-0000-4000-8000-000000000001/'||:'valid_id'||'/primary.json',
  'fileName','phan-gia-pha-'||:'valid_id'||'-primary.json','contentType','application/json',
  'sha256',repeat('b',64),'sizeBytes',1)::text artifact \gset manifest_
select api.export_worker_authorize_artifact(:'valid_id'::uuid,'e1750000-0000-4000-8000-000000000001',:'valid_lease_id'::uuid,:'manifest_artifact'::jsonb) ok \gset artifact_auth_
select api.export_worker_artifact_stored(:'valid_id'::uuid,'e1750000-0000-4000-8000-000000000001',:'valid_lease_id'::uuid,:'manifest_artifact'::jsonb->>'objectPath') ok \gset artifact_stored_
select api.export_worker_complete(:'valid_id'::uuid,'e1750000-0000-4000-8000-000000000001',:'valid_lease_id'::uuid,
  jsonb_build_array(:'manifest_artifact'::jsonb),'[]'::jsonb) ok \gset completed_
reset role;
select set_config('request.jwt.claim.sub','e1700000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e1700000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e1710000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select api.export_download_manifest(:'valid_id'::uuid) download_manifest \gset download_
select private.export_storage_select_allowed(:'manifest_artifact'::jsonb->>'objectPath') storage_allowed \gset download_
select pg_temp.assert_worker_test(:'download_download_manifest'::jsonb->'files'->0->>'objectPath' is not null
  and :'download_storage_allowed'::boolean,'authorized download manifest/storage policy denied');
reset role;
select pg_temp.assert_worker_test(not has_function_privilege('anon','api.export_worker_claim(uuid,integer)','EXECUTE')
  and not has_function_privilege('authenticated','api.export_worker_claim(uuid,integer)','EXECUTE')
  and has_function_privilege('service_role','api.export_worker_claim(uuid,integer)','EXECUTE')
  and not has_table_privilege('authenticated','private.export_artifact_entries','SELECT'),'worker capability or private manifest grant is too broad');
select pg_temp.assert_worker_test((select status='complete' and jsonb_array_length(artifact_manifest)=1
  from private.export_jobs where id=:'valid_id'::uuid),'worker did not persist completion manifest');
select set_config('request.jwt.claim.sub','e1700000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e1700000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e1710000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select pg_temp.assert_worker_download_denied(:'valid_id'::uuid);
select pg_temp.assert_worker_test(not private.export_storage_select_allowed(:'manifest_artifact'::jsonb->>'objectPath'),
  'different live session passed the storage RLS policy');
reset role;

-- A cancellation that wins after upload planning prevents completion and authorizes only job-scoped cleanup.
set local role authenticated;
select pg_temp.export_worker_make_job('e1700000-0000-4000-8000-000000000001','e1710000-0000-4000-8000-000000000002','e1740000-0000-4000-8000-000000000002') result \gset race_
select (:'race_result'::jsonb->>'id') id \gset race_
reset role;
update private.export_jobs set created_at=clock_timestamp()-interval '25 hours' where id=:'race_id'::uuid;
set local role service_role;
select api.export_worker_claim('e1750000-0000-4000-8000-000000000002',120) result \gset race_claim_
select (:'race_claim_result'::jsonb->>'leaseId') lease_id \gset race_
select jsonb_build_object('objectPath','e1720000-0000-4000-8000-000000000001/'||:'race_id'||'/primary.json',
  'fileName','phan-gia-pha-'||:'race_id'||'-primary.json','contentType','application/json',
  'sha256',repeat('c',64),'sizeBytes',1)::text artifact \gset race_manifest_
select api.export_worker_authorize_artifact(:'race_id'::uuid,'e1750000-0000-4000-8000-000000000002',:'race_lease_id'::uuid,:'race_manifest_artifact'::jsonb);
reset role;
select set_config('request.jwt.claim.sub','e1700000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e1700000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e1710000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select api.export_job_cancel(:'race_id'::uuid,2,'Synthetic cancel wins',gen_random_uuid(),repeat('d',64));
reset role;
set local role service_role;
select pg_temp.assert_worker_test(not api.export_worker_complete(:'race_id'::uuid,'e1750000-0000-4000-8000-000000000002',:'race_lease_id'::uuid,'[]'::jsonb,'[]'::jsonb),'cancelled job completed');
select pg_temp.assert_worker_test(api.export_worker_cleanup_authorize(:'race_id'::uuid,'e1750000-0000-4000-8000-000000000002',:'race_lease_id'::uuid,
  array[:'race_manifest_artifact'::jsonb->>'objectPath']),'job cleanup authorization denied');
select pg_temp.assert_worker_test(api.export_worker_cleanup_complete(:'race_id'::uuid,'e1750000-0000-4000-8000-000000000002',:'race_lease_id'::uuid,
  array[:'race_manifest_artifact'::jsonb->>'objectPath']),'cleanup manifest did not clear');
reset role;
select pg_temp.assert_worker_test(exists(select 1 from private.outbox where event_type='export.requested' and resource_id=:'race_id'::uuid)
  and exists(select 1 from private.outbox where event_type='export.cleanup_requested' and resource_id=:'race_id'::uuid and status='published'),
  'export request/cleanup outbox is not durable');

-- A revoked session is not converted into a worker identity; the queued job is failed closed.
set local role authenticated;
select pg_temp.export_worker_make_job('e1700000-0000-4000-8000-000000000001','e1710000-0000-4000-8000-000000000003','e1740000-0000-4000-8000-000000000003') result \gset revoked_
select (:'revoked_result'::jsonb->>'id') id \gset revoked_
reset role;
update private.export_jobs set created_at=clock_timestamp()-interval '25 hours' where id=:'revoked_id'::uuid;
delete from auth.sessions where id='e1710000-0000-4000-8000-000000000003';
set local role service_role;
select api.export_worker_claim('e1750000-0000-4000-8000-000000000003',120);
reset role;
select pg_temp.assert_worker_test((select status='cancelled' and last_error_code='AUTHORIZATION_REVOKED'
  from private.export_jobs where id=:'revoked_id'::uuid),'revoked session export was not stopped');

-- Current database AAL must remain at least the assurance captured for a bulk request.
set local role authenticated;
select pg_temp.export_worker_make_job('e1700000-0000-4000-8000-000000000001','e1710000-0000-4000-8000-000000000004','e1740000-0000-4000-8000-000000000004') result \gset aal_
select (:'aal_result'::jsonb->>'id') id \gset aal_
reset role;
update private.export_jobs set created_at=clock_timestamp()-interval '25 hours' where id=:'aal_id'::uuid;
update auth.sessions set aal='aal1' where id='e1710000-0000-4000-8000-000000000004';
set local role service_role;
select api.export_worker_claim('e1750000-0000-4000-8000-000000000004',120);
reset role;
select pg_temp.assert_worker_test((select status='cancelled' from private.export_jobs where id=:'aal_id'::uuid),'AAL downgrade export was not stopped');

-- Current policy and capability are rechecked after the job was queued.
set local role authenticated;
select pg_temp.export_worker_make_job('e1700000-0000-4000-8000-000000000001','e1710000-0000-4000-8000-000000000005','e1740000-0000-4000-8000-000000000005') result \gset policy_
select (:'policy_result'::jsonb->>'id') id \gset policy_
reset role;
update private.export_jobs set created_at=clock_timestamp()-interval '25 hours' where id=:'policy_id'::uuid;
update private.trees set policy_version=policy_version+1 where id='e1720000-0000-4000-8000-000000000001';
set local role service_role;
select api.export_worker_claim('e1750000-0000-4000-8000-000000000005',120);
reset role;
select pg_temp.assert_worker_test((select status='cancelled' from private.export_jobs where id=:'policy_id'::uuid),'policy-changed export was not stopped');
update private.trees set policy_version=policy_version-1 where id='e1720000-0000-4000-8000-000000000001';

set local role authenticated;
select pg_temp.export_worker_make_job('e1700000-0000-4000-8000-000000000002','e1710000-0000-4000-8000-000000000006','e1740000-0000-4000-8000-000000000006') result \gset capability_
select (:'capability_result'::jsonb->>'id') id \gset capability_
reset role;
update private.export_jobs set created_at=clock_timestamp()-interval '25 hours' where id=:'capability_id'::uuid;
update private.capability_grants set revoked_at=clock_timestamp() where membership_id='e1730000-0000-4000-8000-000000000002' and capability='exports.bulk';
set local role service_role;
select api.export_worker_claim('e1750000-0000-4000-8000-000000000006',120);
reset role;
select pg_temp.assert_worker_test((select status='cancelled' from private.export_jobs where id=:'capability_id'::uuid),'revoked capability export was not stopped');
