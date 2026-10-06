-- Scoped form choices/current jobs; does not expose people or raw permission grants.
begin;
create function private.export_context() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_tree record; v_branch record; v_person uuid; v_job record; v_scopes jsonb:='[]'; v_jobs jsonb:='[]';
begin
  if auth.uid() is null then raise exception using errcode='42501',message='verified export actor required'; end if;
  for v_tree in select t.id,t.name from private.trees t where t.data_mode='demo' and private.is_active_member(t.id) order by t.id loop
    select m.person_id into v_person from private.memberships m join private.persons p on p.tree_id=m.tree_id and p.id=m.person_id
      where m.tree_id=v_tree.id and m.auth_user_id=auth.uid() and m.status='active' and p.deleted_at is null and not p.protected_minor
        and exists(select 1 from private.person_claims c where c.tree_id=m.tree_id and c.membership_id=m.id and c.person_id=p.id
          and c.status='approved' and c.reviewed_by is not null and c.reviewed_by<>c.created_by);
    if v_person is not null then v_scopes:=v_scopes||jsonb_build_array(jsonb_build_object('treeId',v_tree.id,'treeName',v_tree.name,
      'label','Hồ sơ cá nhân đã được duyệt','scope',jsonb_build_object('kind','personal','personId',v_person))); end if;
    if private.has_mfa() then
      if private.has_capability(v_tree.id,'exports.bulk',null) then v_scopes:=v_scopes||jsonb_build_array(jsonb_build_object(
        'treeId',v_tree.id,'treeName',v_tree.name,'label','Toàn cây — theo quyền từng trường','scope',jsonb_build_object('kind','tree'))); end if;
      for v_branch in select b.id,b.name from private.branches b where b.tree_id=v_tree.id and private.has_capability(v_tree.id,'exports.bulk',b.id) order by b.id loop
        v_scopes:=v_scopes||jsonb_build_array(jsonb_build_object('treeId',v_tree.id,'treeName',v_tree.name,'label',v_branch.name,
          'scope',jsonb_build_object('kind','branch','branchId',v_branch.id)));
      end loop;
    end if;
    if jsonb_array_length(v_scopes)>100 then raise exception using errcode='54000',message='export scope capacity exceeded'; end if;
  end loop;
  for v_job in select j.id from private.export_jobs j join private.trees t on t.id=j.tree_id
    where j.requested_by=auth.uid() and j.expires_at>clock_timestamp() and j.policy_version=t.policy_version
      and t.data_mode='demo' and private.is_active_member(t.id) order by j.created_at desc loop
    begin
      v_jobs:=v_jobs||jsonb_build_array(private.export_job_state(v_job.id));
    exception when insufficient_privilege then null; -- revoked scope/MFA/claim: omit the job, not its private values
    end;
  end loop;
  if jsonb_array_length(v_jobs)>3 then raise exception using errcode='54000',message='export job context capacity exceeded'; end if;
  return jsonb_build_object('scopes',v_scopes,'jobs',v_jobs);
end $$;
create function api.export_context() returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.export_context(); $$;
revoke all on function private.export_context(),api.export_context() from public,anon,authenticated;
grant execute on function private.export_context(),api.export_context() to authenticated;
commit;
