-- M16-04: enforce complete source membership when a family mapping is saved.
-- This does not enable batch approval or canonical relationship apply.
begin;

create or replace function private.import_relationship_mapping_coverage_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
  v_job private.import_jobs%rowtype;
  v_family private.import_rows%rowtype;
  v_person private.import_rows%rowtype;
  v_reference text;
  v_selected jsonb;
begin
  select * into v_job from private.import_jobs j where j.id = new.job_id and j.tree_id = new.tree_id;
  if not found then
    raise exception using errcode='22023', message='relationship mapping job is unavailable';
  end if;
  select * into v_family from private.import_rows r
    where r.tree_id = new.tree_id and r.job_id = new.job_id and r.row_number = new.family_row_number;
  if not found or v_family.normalized->>'recordType' is distinct from 'FAM' then
    raise exception using errcode='22023', message='relationship mapping family is unavailable';
  end if;

  foreach v_selected in array array[new.mapping->'partnerExternalIds', new.mapping->'childExternalIds'] loop
    if jsonb_typeof(v_selected) is distinct from 'array' then
      raise exception using errcode='22023', message='relationship participant selection is invalid';
    end if;
  end loop;

  for v_reference in
    select p.value->>'xref' from jsonb_array_elements(coalesce(v_family.normalized->'partnerRefs','[]'::jsonb)) p(value)
    union all
    select c.value from jsonb_array_elements_text(coalesce(v_family.normalized->'childRefs','[]'::jsonb)) c(value)
  loop
    if (select count(*) from private.import_rows r where r.job_id = new.job_id and r.external_id = v_reference
        and r.normalized->>'recordType' in ('INDI','PERSON')) <> 1 then
      raise exception using errcode='22023', message='family pointer does not resolve to one person source row';
    end if;
    select r.* into v_person from private.import_rows r
      where r.job_id = new.job_id and r.external_id = v_reference and r.normalized->>'recordType' in ('INDI','PERSON');
    if not exists(select 1 from private.import_row_decisions d where d.job_id=new.job_id and d.row_number=v_person.row_number and d.excluded)
       and not ((v_family.normalized->'partnerRefs') @> jsonb_build_array(jsonb_build_object('xref',v_reference))
         and new.mapping->'partnerExternalIds' @> jsonb_build_array(v_reference))
       and not ((v_family.normalized->'childRefs') @> jsonb_build_array(v_reference)
         and new.mapping->'childExternalIds' @> jsonb_build_array(v_reference)) then
      raise exception using errcode='22023', message='included family participant is missing from the explicit mapping';
    end if;
  end loop;

  if v_job.format = 'gedcom_551' then
    if exists (
      select 1 from private.import_rows person
      cross join lateral jsonb_array_elements_text(coalesce(person.normalized->'familySpouseRefs','[]'::jsonb)) spouse(value)
      where person.job_id=new.job_id and person.normalized->>'recordType'='INDI' and spouse.value=v_family.external_id
        and not exists(select 1 from private.import_row_decisions d where d.job_id=person.job_id and d.row_number=person.row_number and d.excluded)
        and not (new.mapping->'partnerExternalIds' @> jsonb_build_array(person.external_id))
    ) or exists (
      select 1 from private.import_rows person
      cross join lateral jsonb_array_elements(coalesce(person.normalized->'familyChildRefs','[]'::jsonb)) child(value)
      where person.job_id=new.job_id and person.normalized->>'recordType'='INDI' and child.value->>'xref'=v_family.external_id
        and not exists(select 1 from private.import_row_decisions d where d.job_id=person.job_id and d.row_number=person.row_number and d.excluded)
        and not (new.mapping->'childExternalIds' @> jsonb_build_array(person.external_id))
    ) then
      raise exception using errcode='22023', message='included GEDCOM reverse pointer is missing from the family mapping';
    end if;

    if exists (
      select 1 from jsonb_array_elements(coalesce(v_family.normalized->'partnerRefs','[]'::jsonb)) p(value)
      join private.import_rows person on person.job_id=new.job_id and person.external_id=p.value->>'xref'
        and person.normalized->>'recordType'='INDI'
      where not exists(select 1 from private.import_row_decisions d where d.job_id=person.job_id and d.row_number=person.row_number and d.excluded)
        and not (person.normalized->'familySpouseRefs' @> jsonb_build_array(v_family.external_id))
    ) or exists (
      select 1 from jsonb_array_elements_text(coalesce(v_family.normalized->'childRefs','[]'::jsonb)) c(value)
      join private.import_rows person on person.job_id=new.job_id and person.external_id=c.value
        and person.normalized->>'recordType'='INDI'
      where not exists(select 1 from private.import_row_decisions d where d.job_id=person.job_id and d.row_number=person.row_number and d.excluded)
        and not (person.normalized->'familyChildRefs' @> jsonb_build_array(jsonb_build_object('xref',v_family.external_id)))
    ) then
      raise exception using errcode='22023', message='included GEDCOM family pointer lacks its reciprocal INDI pointer';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.import_relationship_mapping_coverage_guard() from public, anon, authenticated;
drop trigger if exists import_relationship_mapping_coverage_guard on private.import_relationship_mappings;
create trigger import_relationship_mapping_coverage_guard
before insert or update of mapping on private.import_relationship_mappings
for each row execute function private.import_relationship_mapping_coverage_guard();

commit;
