begin;

create or replace function private.content_inline_is_allowlisted(p_inline jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, private
as $$
declare
  v_type text;
  v_href text;
begin
  if jsonb_typeof(p_inline) <> 'object' then
    return false;
  end if;

  v_type := p_inline ->> 'type';

  if v_type in ('text', 'strong', 'emphasis') then
    return (
      (select count(*) from jsonb_object_keys(p_inline)) = 2
      and jsonb_typeof(p_inline -> 'text') = 'string'
      and length(p_inline ->> 'text') between 1 and 10000
    );
  end if;

  if v_type = 'link' then
    v_href := p_inline ->> 'href';
    return (
      (select count(*) from jsonb_object_keys(p_inline)) = 3
      and jsonb_typeof(p_inline -> 'href') = 'string'
      and jsonb_typeof(p_inline -> 'label') = 'string'
      and length(v_href) between 1 and 2048
      and length(p_inline ->> 'label') between 1 and 10000
      and v_href !~ '[[:cntrl:]<>[:space:]]'
      and (
        v_href = '/'
        or v_href ~ '^/[^/]'
        or v_href ~* '^https?://[^[:space:]<>"]+$'
      )
    );
  end if;

  return false;
end;
$$;

create or replace function private.content_body_is_allowlisted(p_body jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, private
as $$
declare
  v_block jsonb;
  v_item jsonb;
  v_child jsonb;
  v_type text;
  v_count integer;
begin
  if jsonb_typeof(p_body) <> 'object'
    or (select count(*) from jsonb_object_keys(p_body)) <> 2
    or p_body ->> 'version' <> '1'
    or jsonb_typeof(p_body -> 'blocks') <> 'array'
    or jsonb_array_length(p_body -> 'blocks') > 200
  then
    return false;
  end if;

  for v_block in select value from jsonb_array_elements(p_body -> 'blocks') loop
    if jsonb_typeof(v_block) <> 'object' then
      return false;
    end if;

    v_type := v_block ->> 'type';

    if v_type in ('paragraph', 'quote') then
      if (select count(*) from jsonb_object_keys(v_block)) <> 2
        or jsonb_typeof(v_block -> 'children') <> 'array'
        or jsonb_array_length(v_block -> 'children') > 100
      then
        return false;
      end if;
      for v_child in select value from jsonb_array_elements(v_block -> 'children') loop
        if not private.content_inline_is_allowlisted(v_child) then
          return false;
        end if;
      end loop;
    elsif v_type = 'heading' then
      if (select count(*) from jsonb_object_keys(v_block)) <> 3
        or (v_block ->> 'level') not in ('2', '3')
        or jsonb_typeof(v_block -> 'children') <> 'array'
        or jsonb_array_length(v_block -> 'children') = 0
        or jsonb_array_length(v_block -> 'children') > 100
      then
        return false;
      end if;
      for v_child in select value from jsonb_array_elements(v_block -> 'children') loop
        if not private.content_inline_is_allowlisted(v_child) then
          return false;
        end if;
      end loop;
    elsif v_type = 'list' then
      if (select count(*) from jsonb_object_keys(v_block)) <> 3
        or jsonb_typeof(v_block -> 'ordered') <> 'boolean'
        or jsonb_typeof(v_block -> 'items') <> 'array'
        or jsonb_array_length(v_block -> 'items') = 0
        or jsonb_array_length(v_block -> 'items') > 50
      then
        return false;
      end if;
      for v_item in select value from jsonb_array_elements(v_block -> 'items') loop
        if jsonb_typeof(v_item) <> 'object'
          or (select count(*) from jsonb_object_keys(v_item)) <> 2
          or v_item ->> 'type' <> 'list_item'
          or jsonb_typeof(v_item -> 'children') <> 'array'
          or jsonb_array_length(v_item -> 'children') = 0
          or jsonb_array_length(v_item -> 'children') > 100
        then
          return false;
        end if;
        for v_child in select value from jsonb_array_elements(v_item -> 'children') loop
          if not private.content_inline_is_allowlisted(v_child) then
            return false;
          end if;
        end loop;
      end loop;
    elsif v_type = 'divider' then
      if (select count(*) from jsonb_object_keys(v_block)) <> 1 then
        return false;
      end if;
    elsif v_type = 'image' then
      v_count := (select count(*) from jsonb_object_keys(v_block));
      if v_count not in (3, 4)
        or jsonb_typeof(v_block -> 'assetId') <> 'string'
        or v_block ->> 'assetId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or jsonb_typeof(v_block -> 'alt') <> 'string'
        or length(v_block ->> 'alt') not between 1 and 300
        or (v_count = 4 and (jsonb_typeof(v_block -> 'caption') <> 'string' or length(v_block ->> 'caption') > 1000))
      then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  return true;
end;
$$;

alter table private.content_revisions
  drop constraint if exists content_revisions_body_allowlist_check;

alter table private.content_revisions
  add constraint content_revisions_body_allowlist_check
  check (private.content_body_is_allowlisted(body));

revoke all on function private.content_inline_is_allowlisted(jsonb) from public, anon, authenticated;
revoke all on function private.content_body_is_allowlisted(jsonb) from public, anon, authenticated;
grant execute on function private.content_inline_is_allowlisted(jsonb) to service_role;
grant execute on function private.content_body_is_allowlisted(jsonb) to service_role;

commit;
