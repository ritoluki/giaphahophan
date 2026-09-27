-- M14-04 authorized fund report projection. Donor/proof columns never enter the result.
begin;

create or replace function private.fund_report_authorized(
  p_fund_id uuid,
  p_from date,
  p_to date
)
returns table (
  fund_id uuid,
  from_date date,
  to_date date,
  opening_vnd text,
  income_vnd text,
  expense_vnd text,
  closing_vnd text
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_fund private.funds%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if p_fund_id is null or p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = '22023', message = 'fund report range is invalid';
  end if;

  select * into v_fund from private.funds f where f.id = p_fund_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'fund not found';
  end if;

  if v_fund.visibility = 'restricted' then
    if not private.has_capability(v_fund.tree_id, 'treasury.write', null)
       and not private.has_capability(v_fund.tree_id, 'treasury.approve', null) then
      raise exception using errcode = '42501', message = 'restricted fund report capability required';
    end if;
  elsif not private.is_active_member(v_fund.tree_id) then
    raise exception using errcode = '42501', message = 'active membership required';
  end if;

  return query
  select
    v_fund.id,
    p_from,
    p_to,
    coalesce(sum(case
      when e.entry_date < p_from and a.kind = 'asset' then l.signed_amount_vnd::numeric
      else 0::numeric
    end), 0::numeric)::text,
    coalesce(sum(case
      when e.entry_date between p_from and p_to
       and a.kind = 'asset'
       and l.signed_amount_vnd > 0 then l.signed_amount_vnd::numeric
      else 0::numeric
    end), 0::numeric)::text,
    coalesce(sum(case
      when e.entry_date between p_from and p_to
       and a.kind = 'asset'
       and l.signed_amount_vnd < 0 then (-l.signed_amount_vnd::numeric)
      else 0::numeric
    end), 0::numeric)::text,
    coalesce(sum(case
      when e.entry_date <= p_to and a.kind = 'asset' then l.signed_amount_vnd::numeric
      else 0::numeric
    end), 0::numeric)::text
  from private.journal_entries e
  join private.journal_lines l on l.tree_id = e.tree_id and l.fund_id = e.fund_id and l.entry_id = e.id
  join private.fund_accounts a on a.tree_id = l.tree_id and a.fund_id = l.fund_id and a.id = l.account_id
  where e.tree_id = v_fund.tree_id
    and e.fund_id = v_fund.id
    and e.status = 'posted';
end;
$$;

create or replace function api.fund_report(p_fund_id uuid, p_from date, p_to date)
returns table (fund_id uuid, from_date date, to_date date, opening_vnd text, income_vnd text, expense_vnd text, closing_vnd text)
language sql
security invoker
set search_path = pg_catalog
as $$
  select * from private.fund_report_authorized($1, $2, $3);
$$;

revoke all on function private.fund_report_authorized(uuid,date,date) from public, anon, authenticated;
grant execute on function private.fund_report_authorized(uuid,date,date) to authenticated;
revoke all on function api.fund_report(uuid,date,date) from public, anon, authenticated;
grant usage on schema api to authenticated;
grant execute on function api.fund_report(uuid,date,date) to authenticated;

commit;