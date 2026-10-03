-- M16-04: database-owned whole-job source coverage predicate.
-- Kept private until the atomic canonical apply transition is installed.
begin;

create or replace function private.import_relationship_batch_complete(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with job as (
    select j.id, j.tree_id, j.source_namespace, j.format
    from private.import_jobs j where j.id = p_job_id
  ), included as (
    select r.*, coalesce(d.excluded,false) excluded
    from private.import_rows r
    join job j on j.id=r.job_id and j.tree_id=r.tree_id
    left join private.import_row_decisions d on d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number
    where not coalesce(d.excluded,false)
  ), families as (
    select r.*, m.mapping
    from included r
    left join private.import_relationship_mappings m on m.tree_id=r.tree_id and m.job_id=r.job_id and m.family_row_number=r.row_number
    where r.normalized->>'recordType'='FAM'
  ), unsupported as (
    select 1 from included r
    where r.status not in ('valid','review')
       or (r.status='review' and r.errors is distinct from '["relationship_mapping_requires_review"]'::jsonb)
       or (r.status='valid' and jsonb_array_length(r.errors)>0)
       or r.external_id is null
       or (coalesce(r.normalized->>'recordType','INDI') not in ('INDI','PERSON','FAM'))
       or (r.normalized->>'recordType'='FAM' and
          (jsonb_array_length(coalesce(r.normalized->'partnerRefs','[]'::jsonb))
             + jsonb_array_length(coalesce(r.normalized->'childRefs','[]'::jsonb)) > 0)
          and (not exists(select 1 from private.import_relationship_mappings m
            where m.tree_id=r.tree_id and m.job_id=r.job_id and m.family_row_number=r.row_number)
            or jsonb_array_length(coalesce(r.normalized->'partnerRefs','[]'::jsonb))=0))
  ), missing_external_map as (
    select 1 from included r cross join job j
    where not exists(select 1 from private.external_id_map x where x.tree_id=r.tree_id
      and x.source_namespace=j.source_namespace and x.external_id=r.external_id
      and x.entity_kind=case when r.normalized->>'recordType'='FAM' then 'family' else 'person' end)
  ), invalid_family_mapping as (
    select 1 from families f
    where f.mapping is not null and (
      (select count(*) from jsonb_array_elements(coalesce(f.normalized->'partnerRefs','[]'::jsonb)) p(value)
        join included i on i.job_id=f.job_id and i.external_id=p.value->>'xref' and i.normalized->>'recordType' in ('INDI','PERSON'))
        <> jsonb_array_length(coalesce(f.mapping->'partnerExternalIds','[]'::jsonb))
      or exists(select 1 from jsonb_array_elements(coalesce(f.normalized->'partnerRefs','[]'::jsonb)) p(value)
        join included i on i.job_id=f.job_id and i.external_id=p.value->>'xref' and i.normalized->>'recordType' in ('INDI','PERSON')
        where not (f.mapping->'partnerExternalIds' @> jsonb_build_array(i.external_id)))
      or (select count(*) from jsonb_array_elements_text(coalesce(f.normalized->'childRefs','[]'::jsonb)) c(value)
        join included i on i.job_id=f.job_id and i.external_id=c.value and i.normalized->>'recordType' in ('INDI','PERSON'))
        <> jsonb_array_length(coalesce(f.mapping->'childExternalIds','[]'::jsonb))
      or exists(select 1 from jsonb_array_elements_text(coalesce(f.normalized->'childRefs','[]'::jsonb)) c(value)
        join included i on i.job_id=f.job_id and i.external_id=c.value and i.normalized->>'recordType' in ('INDI','PERSON')
        where not (f.mapping->'childExternalIds' @> jsonb_build_array(i.external_id)))
    )
  ), dangling_reverse_pointer as (
    select 1 from included person cross join job j
    cross join lateral jsonb_array_elements_text(coalesce(person.normalized->'familySpouseRefs','[]'::jsonb)) s(value)
    where person.normalized->>'recordType'='INDI' and j.format='gedcom_551'
      and not exists(select 1 from families f where f.external_id=s.value and f.mapping->'partnerExternalIds' @> jsonb_build_array(person.external_id))
    union all
    select 1 from included person cross join job j
    cross join lateral jsonb_array_elements(coalesce(person.normalized->'familyChildRefs','[]'::jsonb)) c(value)
    where person.normalized->>'recordType'='INDI' and j.format='gedcom_551'
      and not exists(select 1 from families f where f.external_id=c.value->>'xref' and f.mapping->'childExternalIds' @> jsonb_build_array(person.external_id))
  )
  select exists(select 1 from job)
    and not exists(select 1 from unsupported)
    and not exists(select 1 from missing_external_map)
    and not exists(select 1 from invalid_family_mapping)
    and not exists(select 1 from dangling_reverse_pointer);
$$;

revoke all on function private.import_relationship_batch_complete(uuid) from public, anon, authenticated;

commit;
