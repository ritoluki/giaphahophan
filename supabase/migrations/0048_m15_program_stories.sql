begin;
create or replace function private.scholarship_program_stories_authorized(p_program_id uuid)
returns table(id uuid,version bigint,title text,story text,published_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,private
as $$
declare v_tree_id uuid;
begin
  select p.tree_id into v_tree_id from private.scholarship_programs p where p.id=p_program_id;
  if v_tree_id is null then raise exception using errcode='P0002',message='scholarship program not found'; end if;
  if auth.uid() is null or not private.is_active_member(v_tree_id) then raise exception using errcode='42501',message='active tree membership required'; end if;
  return query select p.id,p.version,p.title,p.story,p.published_at from private.scholarship_publications p join private.scholarship_applications a on a.tree_id=p.tree_id and a.id=p.application_id where p.tree_id=v_tree_id and a.program_id=p_program_id and p.status='approved' and p.published_at is not null and ((a.minor_status='minor' and a.guardian_status='verified') or (a.minor_status='adult' and a.guardian_status='not_required')) order by p.published_at desc,p.id;
end;
$$;
create or replace function api.scholarship_program_stories(p_program_id uuid)
returns table(id uuid,version bigint,title text,story text,published_at timestamptz)
language sql stable security invoker set search_path=pg_catalog,private as $$ select * from private.scholarship_program_stories_authorized($1); $$;
revoke all on function private.scholarship_program_stories_authorized(uuid) from public,anon,authenticated;
grant execute on function private.scholarship_program_stories_authorized(uuid),api.scholarship_program_stories(uuid) to authenticated;
commit;