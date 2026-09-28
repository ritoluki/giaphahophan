begin;

create or replace function private.scholarship_report_authorized(
  p_fund_id uuid,
  p_from date,
  p_to date
)
returns table (
  fund_id uuid,
  from_date date,
  to_date date,
  awards_count bigint,
  applicants_count bigint,
  donors_count bigint,
  approved_amount_vnd text,
  paid_amount_vnd text,
  reversed_amount_vnd text,
  net_paid_amount_vnd text
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_fund private.funds%rowtype;
  v_actor uuid := auth.uid();
  v_can_applicant_detail boolean;
  v_can_donor_detail boolean;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if p_fund_id is null or p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = '22023', message = 'scholarship report range is invalid';
  end if;

  select * into v_fund from private.funds f where f.id = p_fund_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'fund not found';
  end if;

  if v_fund.visibility = 'restricted' then
    if not private.has_capability(v_fund.tree_id, 'treasury.write', null)
       and not private.has_capability(v_fund.tree_id, 'treasury.approve', null)
       and not private.has_capability(v_fund.tree_id, 'scholarship.review', null)
       and not private.has_capability(v_fund.tree_id, 'scholarship.manage', null) then
      raise exception using errcode = '42501', message = 'restricted scholarship report capability required';
    end if;
  elsif not private.is_active_member(v_fund.tree_id) then
    raise exception using errcode = '42501', message = 'active membership required';
  end if;

  v_can_applicant_detail := private.has_capability(v_fund.tree_id, 'scholarship.review', null)
    or private.has_capability(v_fund.tree_id, 'scholarship.manage', null);
  v_can_donor_detail := private.has_capability(v_fund.tree_id, 'treasury.write', null)
    or private.has_capability(v_fund.tree_id, 'treasury.approve', null);

  return query
  with award_rollup as (
    select
      count(*) filter (where a.status <> 'withdrawn')::bigint as awards_count,
      count(distinct a.application_id) filter (where a.status <> 'withdrawn')::bigint as applicants_count,
      coalesce(sum(a.amount_vnd) filter (where a.status <> 'withdrawn'), 0)::numeric::text as approved_amount_vnd
    from private.scholarship_awards a
    where a.tree_id = v_fund.tree_id
      and a.fund_id = v_fund.id
      and a.created_at::date between p_from and p_to
  ),
  paid_rollup as (
    select coalesce(sum(a.amount_vnd), 0)::numeric::text as paid_amount_vnd
    from private.scholarship_awards a
    join private.journal_entries e
      on e.tree_id = a.tree_id
     and e.fund_id = a.fund_id
     and e.id = a.paid_journal_entry_id
     and e.status = 'posted'
    where a.tree_id = v_fund.tree_id
      and a.fund_id = v_fund.id
      and a.status in ('paid', 'reversed')
      and e.entry_date between p_from and p_to
  ),
  reversal_rollup as (
    select coalesce(sum(a.amount_vnd), 0)::numeric::text as reversed_amount_vnd
    from private.scholarship_awards a
    join private.journal_entries e
      on e.tree_id = a.tree_id
     and e.fund_id = a.fund_id
     and e.id = a.reversal_journal_entry_id
     and e.status = 'posted'
    where a.tree_id = v_fund.tree_id
      and a.fund_id = v_fund.id
      and a.status = 'reversed'
      and e.entry_date between p_from and p_to
  ),
  donor_rollup as (
    select count(distinct e.donor_person_id)::bigint as donors_count
    from private.journal_entries e
    where e.tree_id = v_fund.tree_id
      and e.fund_id = v_fund.id
      and e.status = 'posted'
      and e.entry_date between p_from and p_to
      and e.donor_person_id is not null
  )
  select
    v_fund.id,
    p_from,
    p_to,
    ar.awards_count,
    case when v_can_applicant_detail then ar.applicants_count else null end,
    case when v_can_donor_detail then dr.donors_count else null end,
    ar.approved_amount_vnd,
    pr.paid_amount_vnd,
    rr.reversed_amount_vnd,
    (pr.paid_amount_vnd::numeric - rr.reversed_amount_vnd::numeric)::text
  from award_rollup ar
  cross join paid_rollup pr
  cross join reversal_rollup rr
  cross join donor_rollup dr;
end;
$$;

create or replace function api.scholarship_report(p_fund_id uuid, p_from date, p_to date)
returns table (
  fund_id uuid,
  from_date date,
  to_date date,
  awards_count bigint,
  applicants_count bigint,
  donors_count bigint,
  approved_amount_vnd text,
  paid_amount_vnd text,
  reversed_amount_vnd text,
  net_paid_amount_vnd text
)
language sql
security invoker
set search_path = pg_catalog
as $$
  select * from private.scholarship_report_authorized($1, $2, $3);
$$;

revoke all on function private.scholarship_report_authorized(uuid,date,date) from public, anon, authenticated;
grant execute on function private.scholarship_report_authorized(uuid,date,date) to authenticated;
revoke all on function api.scholarship_report(uuid,date,date) from public, anon, authenticated;
grant usage on schema api to authenticated;
grant execute on function api.scholarship_report(uuid,date,date) to authenticated;

commit;