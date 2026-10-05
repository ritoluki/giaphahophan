-- M16-04: graph guard shares the canonical parent-link transaction lock.
-- Private and read-only; canonical writes are added only with the full atomic apply boundary.
begin;

create or replace function private.import_relationship_graph_is_safe(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tree_id uuid;
  v_duplicate boolean;
  v_over_limit boolean;
  v_cycle boolean;
begin
  select j.tree_id into v_tree_id from private.import_jobs j where j.id=p_job_id for share;
  if not found then return false; end if;
  perform private.import_require_demo_tree(v_tree_id);
  -- Same tree-wide lock used by canonical parent-link proposal apply.
  perform pg_advisory_xact_lock(hashtextextended(v_tree_id::text,0));
  if not private.import_relationship_batch_complete(p_job_id) then return false; end if;

  with proposed as (
    select parent_map.canonical_id parent_id, child_map.canonical_id child_id,
      edge.value->>'kind' kind, edge.value->>'status' status
    from private.import_relationship_mappings mapping
    join private.import_jobs job on job.id=mapping.job_id and job.tree_id=mapping.tree_id
    join private.import_rows family on family.tree_id=mapping.tree_id and family.job_id=mapping.job_id
      and family.row_number=mapping.family_row_number
    cross join lateral jsonb_array_elements(coalesce(mapping.mapping->'parentLinks','[]'::jsonb)) edge(value)
    join private.external_id_map parent_map on parent_map.tree_id=job.tree_id and parent_map.source_namespace=job.source_namespace
      and parent_map.external_id=edge.value->>'parentExternalId' and parent_map.entity_kind='person'
    join private.external_id_map child_map on child_map.tree_id=job.tree_id and child_map.source_namespace=job.source_namespace
      and child_map.external_id=edge.value->>'childExternalId' and child_map.entity_kind='person'
    where job.id=p_job_id
  )
  select exists(
      select 1 from proposed group by parent_id,child_id,kind having count(*)>1
    ) or exists(
      select 1 from proposed p join private.parent_links current_link
        on current_link.tree_id=v_tree_id and current_link.parent_id=p.parent_id
        and current_link.child_id=p.child_id and current_link.kind=p.kind
    ) into v_duplicate;
  if v_duplicate then return false; end if;

  with proposed_bio as (
    select parent_map.canonical_id parent_id, child_map.canonical_id child_id
    from private.import_relationship_mappings mapping
    join private.import_jobs job on job.id=mapping.job_id and job.tree_id=mapping.tree_id
    cross join lateral jsonb_array_elements(coalesce(mapping.mapping->'parentLinks','[]'::jsonb)) edge(value)
    join private.external_id_map parent_map on parent_map.tree_id=job.tree_id and parent_map.source_namespace=job.source_namespace
      and parent_map.external_id=edge.value->>'parentExternalId' and parent_map.entity_kind='person'
    join private.external_id_map child_map on child_map.tree_id=job.tree_id and child_map.source_namespace=job.source_namespace
      and child_map.external_id=edge.value->>'childExternalId' and child_map.entity_kind='person'
    where job.id=p_job_id and edge.value->>'kind'='biological' and edge.value->>'status'='confirmed'
  ), all_bio as (
    select pl.parent_id,pl.child_id from private.parent_links pl
      where pl.tree_id=v_tree_id and pl.deleted_at is null and pl.kind='biological' and pl.status='confirmed'
    union
    select parent_id,child_id from proposed_bio
  )
  select exists(select 1 from all_bio group by child_id having count(distinct parent_id)>2)
    into v_over_limit;
  if v_over_limit then return false; end if;

  with recursive proposed as (
    select parent_map.canonical_id parent_id, child_map.canonical_id child_id,
      edge.value->>'kind' kind, edge.value->>'status' status
    from private.import_relationship_mappings mapping
    join private.import_jobs job on job.id=mapping.job_id and job.tree_id=mapping.tree_id
    cross join lateral jsonb_array_elements(coalesce(mapping.mapping->'parentLinks','[]'::jsonb)) edge(value)
    join private.external_id_map parent_map on parent_map.tree_id=job.tree_id and parent_map.source_namespace=job.source_namespace
      and parent_map.external_id=edge.value->>'parentExternalId' and parent_map.entity_kind='person'
    join private.external_id_map child_map on child_map.tree_id=job.tree_id and child_map.source_namespace=job.source_namespace
      and child_map.external_id=edge.value->>'childExternalId' and child_map.entity_kind='person'
    where job.id=p_job_id and edge.value->>'status'='confirmed'
      and edge.value->>'kind' in ('biological','adoptive')
  ), graph_edges as (
    select pl.parent_id,pl.child_id from private.parent_links pl
      where pl.tree_id=v_tree_id and pl.deleted_at is null and pl.status='confirmed'
        and pl.kind in ('biological','adoptive')
    union
    select parent_id,child_id from proposed
  ), reach(start_id,node_id) as (
    select parent_id,child_id from proposed
    union
    select reach.start_id,edge.child_id
    from reach join graph_edges edge on edge.parent_id=reach.node_id
  )
  select exists(select 1 from reach where start_id=node_id) into v_cycle;
  return not v_cycle;
end;
$$;

revoke all on function private.import_relationship_graph_is_safe(uuid) from public, anon, authenticated;

commit;
