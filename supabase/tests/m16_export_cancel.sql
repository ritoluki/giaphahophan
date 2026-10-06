-- Runs inside the existing synthetic export transaction, after projection checks.
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e1600000-0000-4000-8000-000000000012"}',true);
reset role;
update private.export_jobs set expires_at=clock_timestamp()+interval '1 hour' where id=:'job_id'::uuid;
select set_config('test.export_job_id',:'job_id',true);
set local role authenticated;
do $$ declare v_id uuid:=current_setting('test.export_job_id')::uuid; v_a jsonb; v_b jsonb; begin
  begin perform api.export_job_cancel(v_id,2,'Synthetic cancellation',gen_random_uuid(),repeat('a',64));
    raise exception 'stale cancel accepted'; exception when serialization_failure then null; end;
  v_a:=api.export_job_cancel(v_id,1,'Synthetic cancellation','e1640000-0000-4000-8000-000000000071',repeat('a',64));
  v_b:=api.export_job_cancel(v_id,1,'Synthetic cancellation','e1640000-0000-4000-8000-000000000071',repeat('a',64));
  if v_a<>v_b or v_a->>'status'<>'cancelled' or (v_a->>'version')::int<>2 or v_a ? 'request' then raise exception 'cancel/replay projection'; end if;
  begin perform api.export_job_cancel(v_id,1,'Changed cancellation','e1640000-0000-4000-8000-000000000071',repeat('a',64));
    raise exception 'same hash changed reason accepted'; exception when sqlstate 'P0008' then null; end;
  begin perform api.export_job_cancel(v_id,2,'Synthetic cancellation','e1640000-0000-4000-8000-000000000071',repeat('a',64));
    raise exception 'same hash changed version accepted'; exception when sqlstate 'P0008' then null; end;
  begin perform api.export_job_cancel(v_id,2,'Synthetic cancellation',gen_random_uuid(),repeat('a',64));
    raise exception 'new key cancelled terminal accepted'; exception when serialization_failure then null; end;
  begin perform api.export_projection(v_id); raise exception 'cancelled projection available'; exception when insufficient_privilege then null; end;
  begin perform pg_temp.export_request('e1610000-0000-4000-8000-000000000001','json','{"kind":"tree"}','Cancellation does not refund quota',gen_random_uuid(),repeat('a',64));
    raise exception 'cancel refunded quota'; exception when sqlstate 'P0010' then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"e1600000-0000-4000-8000-000000000011"}',true);
do $$ begin
  begin perform api.export_job_cancel(current_setting('test.export_job_id')::uuid,1,'Synthetic cancellation','e1640000-0000-4000-8000-000000000071',repeat('a',64));
    raise exception 'AAL1 replay accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"e1600000-0000-4000-8000-000000000022"}',true);
do $$ begin
  begin perform api.export_job_cancel(current_setting('test.export_job_id')::uuid,1,'Synthetic cancellation',gen_random_uuid(),repeat('a',64));
    raise exception 'other actor cancelled'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e1600000-0000-4000-8000-000000000012"}',true);
update private.memberships set status='revoked' where id='e1620000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  begin perform api.export_job_cancel(current_setting('test.export_job_id')::uuid,1,'Synthetic cancellation','e1640000-0000-4000-8000-000000000071',repeat('a',64));
    raise exception 'revoked replay accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.memberships set status='active' where id='e1620000-0000-4000-8000-000000000001';
update private.export_jobs set expires_at=clock_timestamp()-interval '1 second' where id=:'job_id'::uuid;
set local role authenticated;
do $$ begin
  begin perform api.export_job_cancel(current_setting('test.export_job_id')::uuid,1,'Synthetic cancellation','e1640000-0000-4000-8000-000000000071',repeat('a',64));
    raise exception 'expired replay accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Other status paths use existing synthetic owner jobs, not manufactured completion evidence.
update private.export_jobs set status='running' where requested_by='e1600000-0000-4000-8000-000000000001' and format='csv';
select id running_id from private.export_jobs where requested_by='e1600000-0000-4000-8000-000000000001' and format='csv' \gset
set local role authenticated;
select api.export_job_cancel(:'running_id'::uuid,1,'Cancel synthetic running job',gen_random_uuid(),repeat('a',64));
reset role;
update private.export_jobs set status='complete' where requested_by='e1600000-0000-4000-8000-000000000001' and format='pdf';
select id complete_id from private.export_jobs where requested_by='e1600000-0000-4000-8000-000000000001' and format='pdf' \gset
set local role authenticated;
select format('do $b$ begin begin perform api.export_job_cancel(%L::uuid,1,''Synthetic terminal cancellation'',gen_random_uuid(),repeat(''a'',64)); raise exception ''complete cancel accepted''; exception when serialization_failure then null; end; end $b$;',:'complete_id') \gexec
reset role;
do $$ begin
  if has_function_privilege('anon','api.export_job_cancel(uuid,bigint,text,uuid,text)','EXECUTE') then raise exception 'anonymous cancel grant'; end if;
  if (select count(*) from private.export_jobs where tree_id='e1610000-0000-4000-8000-000000000001' and status='cancelled')<>2 then raise exception 'cancellation count'; end if;
  if (select count(*) from private.audit_events where tree_id='e1610000-0000-4000-8000-000000000001' and action='export.cancelled')<>2 then raise exception 'cancel replay duplicated audit'; end if;
  if not exists(select 1 from private.persons where id='e1630000-0000-4000-8000-000000000001') then raise exception 'cancel deleted canonical'; end if;
end $$;
