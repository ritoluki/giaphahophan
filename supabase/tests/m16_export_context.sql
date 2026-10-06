-- Existing export fixture: owner active/AAL2, main job expired, two other own jobs live.
set local role authenticated;
do $$ declare v_context jsonb:=api.export_context(); begin
  if jsonb_array_length(v_context->'scopes')<1 or jsonb_array_length(v_context->'jobs')<>2 then raise exception 'owner context scope/jobs mismatch'; end if;
  if not exists(select 1 from jsonb_array_elements(v_context->'scopes') s where s->'scope'->>'kind'='tree' and s->>'label'='Toàn cây — theo quyền từng trường') then raise exception 'Vietnamese scope label encoding'; end if;
  if exists(select 1 from jsonb_array_elements(v_context->'jobs') j where j->>'id'=current_setting('test.export_job_id')) then raise exception 'expired job in context'; end if;
  if v_context::text like '%purpose%' or v_context::text like '%resultAssetId%' or v_context::text like '%requestedBy%' then raise exception 'private context field'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"e1600000-0000-4000-8000-000000000011"}',true);
do $$ declare v_context jsonb:=api.export_context(); begin
  if v_context->'scopes'<>'[]'::jsonb or v_context->'jobs'<>'[]'::jsonb then raise exception 'owner bulk without MFA context'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','e1600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"e1600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1","session_id":"e1600000-0000-4000-8000-000000000021"}',true);
set local role authenticated;
do $$ declare v_context jsonb:=api.export_context(); begin
  if v_context->'scopes'<>'[]'::jsonb then raise exception 'minor scope in context'; end if;
  if exists(select 1 from jsonb_array_elements(v_context->'jobs') j where j->'scope'->>'kind'<>'personal') then raise exception 'other actor bulk job in context'; end if;
end $$;
reset role;
update private.persons set protected_minor=false where id='e1630000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare v_context jsonb:=api.export_context(); begin
  if jsonb_array_length(v_context->'scopes')<>1 or v_context->'scopes'->0->'scope'->>'kind'<>'personal' then raise exception 'approved personal scope missing'; end if;
  if v_context->'scopes'->0->>'label'<>'Hồ sơ cá nhân đã được duyệt' then raise exception 'Vietnamese personal label encoding'; end if;
end $$;
reset role;
update private.memberships set status='revoked' where id='e1620000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare v_context jsonb:=api.export_context(); begin
  if v_context<>jsonb_build_object('scopes','[]'::jsonb,'jobs','[]'::jsonb) then raise exception 'revoked context retained'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','api.export_context()','EXECUTE') then raise exception 'anonymous export context grant'; end if;
end $$;
