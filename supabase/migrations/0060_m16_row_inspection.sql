-- M16-04: inspect all staged rows through bounded, version-bound keyset pages.
begin;
create or replace function private.import_rows_page(p_job_id uuid,p_base_version bigint,p_after integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_job private.import_jobs%rowtype; v_rows jsonb; v_last integer; v_more boolean;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for share;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then
    raise exception using errcode='42501',message='import unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if p_base_version is null or p_base_version<1 or p_after is null or p_after not between 0 and 10000 then
    raise exception using errcode='22023',message='invalid row page'; end if;
  if v_job.version<>p_base_version then raise exception using errcode='40001',message='import version changed'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('rowNumber',r.row_number,'externalId',coalesce(left(r.external_id,300),''),
    'displayName',coalesce(left(r.normalized->>'displayName',300),left(r.raw_payload->>'displayName',300),'(không có tên)'),
    'status',r.status,'excluded',coalesce(d.excluded,false),'errors',(select coalesce(jsonb_agg(left(e.value,1000)),'[]'::jsonb)
      from jsonb_array_elements_text(r.errors) e(value))) order by r.row_number),'[]'::jsonb),max(r.row_number)
    into v_rows,v_last from (select * from private.import_rows where job_id=p_job_id and row_number>p_after order by row_number limit 50) r
      left join private.import_row_decisions d on d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number;
  select exists(select 1 from private.import_rows where job_id=p_job_id and row_number>v_last) into v_more;
  return jsonb_build_object('jobId',p_job_id,'version',v_job.version,'rows',v_rows,'nextCursor',case when v_more then v_last else null end);
end;
$$;
create or replace function api.import_rows_page(p_job_id uuid,p_base_version bigint,p_after integer)
returns jsonb language sql security invoker set search_path=pg_catalog as $$ select private.import_rows_page($1,$2,$3); $$;
revoke all on function private.import_rows_page(uuid,bigint,integer),api.import_rows_page(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function private.import_rows_page(uuid,bigint,integer),api.import_rows_page(uuid,bigint,integer) to authenticated;
commit;
