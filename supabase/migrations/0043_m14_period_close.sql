-- M14-05 period close/reconciliation. Snapshot is projection-only; no bank sync.
begin;

create table private.fund_period_closures (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  fund_id uuid not null,
  period_from date not null,
  period_to date not null,
  fund_version bigint not null,
  status text not null default 'locked' check (status = 'locked'),
  opening_vnd text not null,
  income_vnd text not null,
  expense_vnd text not null,
  closing_vnd text not null,
  posted_entries integer not null check (posted_entries >= 0),
  proof_total integer not null check (proof_total >= 0),
  proof_ready integer not null check (proof_ready >= 0),
  proof_pending integer not null check (proof_pending >= 0),
  proof_missing integer not null check (proof_missing >= 0),
  proof_rejected integer not null check (proof_rejected >= 0),
  locked_at timestamptz not null default clock_timestamp(),
  locked_by uuid not null references auth.users(id),
  unique (tree_id, fund_id, id),
  unique (tree_id, fund_id, period_from, period_to),
  foreign key (tree_id, fund_id) references private.funds(tree_id, id),
  check (period_from <= period_to),
  check (proof_ready + proof_pending + proof_missing + proof_rejected = proof_total)
);

create index fund_period_closures_lookup_idx
  on private.fund_period_closures (tree_id, fund_id, period_from, period_to);

alter table private.fund_period_closures enable row level security;
alter table private.fund_period_closures force row level security;
revoke all on table private.fund_period_closures from public, anon, authenticated;
grant all on table private.fund_period_closures to service_role;

create or replace function private.prevent_closed_fund_journal_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_closed_through date;
begin
  select f.closed_through into v_closed_through
  from private.funds f
  where f.tree_id = new.tree_id and f.id = new.fund_id;

  if v_closed_through is not null and new.entry_date <= v_closed_through then
    raise exception using errcode = 'P0001', message = 'journal period is closed';
  end if;
  return new;
end;
$$;

drop trigger if exists journal_closed_period_guard on private.journal_entries;
create trigger journal_closed_period_guard
before insert or update of fund_id, entry_date, status on private.journal_entries
for each row execute function private.prevent_closed_fund_journal_period();

create or replace function private.fund_period_reconciliation(
  p_fund_id uuid,
  p_from date,
  p_to date
)
returns table (
  fund_id uuid,
  from_date date,
  to_date date,
  status text,
  version bigint,
  opening_vnd text,
  income_vnd text,
  expense_vnd text,
  closing_vnd text,
  posted_entries integer,
  proof_total integer,
  proof_ready integer,
  proof_pending integer,
  proof_missing integer,
  proof_rejected integer,
  locked_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_fund private.funds%rowtype;
  v_actor uuid := auth.uid();
  v_closure private.fund_period_closures%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if p_fund_id is null or p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = '22023', message = 'reconciliation range is invalid';
  end if;

  select * into v_fund from private.funds f where f.id = p_fund_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'fund not found';
  end if;

  if v_fund.visibility = 'restricted' then
    if not private.has_capability(v_fund.tree_id, 'treasury.write', null)
       and not private.has_capability(v_fund.tree_id, 'treasury.approve', null) then
      raise exception using errcode = '42501', message = 'restricted reconciliation capability required';
    end if;
  elsif not private.is_active_member(v_fund.tree_id) then
    raise exception using errcode = '42501', message = 'active membership required';
  end if;

  select * into v_closure
  from private.fund_period_closures c
  where c.tree_id = v_fund.tree_id
    and c.fund_id = v_fund.id
    and c.period_from = p_from
    and c.period_to = p_to;

  if found then
    return query select
      v_closure.fund_id, v_closure.period_from, v_closure.period_to, v_closure.status,
      v_closure.fund_version, v_closure.opening_vnd, v_closure.income_vnd,
      v_closure.expense_vnd, v_closure.closing_vnd, v_closure.posted_entries,
      v_closure.proof_total, v_closure.proof_ready, v_closure.proof_pending,
      v_closure.proof_missing, v_closure.proof_rejected, v_closure.locked_at;
    return;
  end if;

  return query
  select
    v_fund.id,
    p_from,
    p_to,
    'open'::text,
    v_fund.version,
    coalesce(sum(case
      when e.entry_date < p_from and a.kind = 'asset' then l.signed_amount_vnd::numeric
      else 0::numeric
    end), 0::numeric)::text,
    coalesce(sum(case
      when e.entry_date between p_from and p_to and a.kind = 'asset' and l.signed_amount_vnd > 0
        then l.signed_amount_vnd::numeric
      else 0::numeric
    end), 0::numeric)::text,
    coalesce(sum(case
      when e.entry_date between p_from and p_to and a.kind = 'asset' and l.signed_amount_vnd < 0
        then (-l.signed_amount_vnd::numeric)
      else 0::numeric
    end), 0::numeric)::text,
    coalesce(sum(case
      when e.entry_date <= p_to and a.kind = 'asset' then l.signed_amount_vnd::numeric
      else 0::numeric
    end), 0::numeric)::text,
    count(distinct e.id) filter (where e.entry_date between p_from and p_to)::integer,
    count(distinct e.id) filter (where e.entry_date between p_from and p_to)::integer,
    count(distinct e.id) filter (where e.entry_date between p_from and p_to and m.id is not null and m.state = 'ready')::integer,
    count(distinct e.id) filter (where e.entry_date between p_from and p_to and m.id is not null and m.state not in ('ready','rejected','failed','quarantined'))::integer,
    count(distinct e.id) filter (where e.entry_date between p_from and p_to and e.proof_asset_id is null)::integer,
    count(distinct e.id) filter (where e.entry_date between p_from and p_to and m.id is not null and m.state in ('rejected','failed','quarantined'))::integer,
    null::timestamptz
  from private.journal_entries e
  left join private.journal_lines l
    on l.tree_id = e.tree_id and l.fund_id = e.fund_id and l.entry_id = e.id
  left join private.fund_accounts a
    on a.tree_id = l.tree_id and a.fund_id = l.fund_id and a.id = l.account_id
  left join private.media_assets m
    on m.tree_id = e.tree_id and m.id = e.proof_asset_id
  where e.tree_id = v_fund.tree_id
    and e.fund_id = v_fund.id
    and e.status = 'posted';
end;
$$;

create or replace function private.fund_period_close_idempotent(
  p_fund_id uuid,
  p_from date,
  p_to date,
  p_reason text,
  p_base_version bigint,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  fund_id uuid,
  from_date date,
  to_date date,
  status text,
  version bigint,
  opening_vnd text,
  income_vnd text,
  expense_vnd text,
  closing_vnd text,
  posted_entries integer,
  proof_total integer,
  proof_ready integer,
  proof_pending integer,
  proof_missing integer,
  proof_rejected integer,
  locked_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_fund private.funds%rowtype;
  v_existing private.idempotency_records%rowtype;
  v_report record;
  v_closure private.fund_period_closures%rowtype;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 2000 then
    raise exception using errcode = '22023', message = 'period close reason is required';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_base_version is null or p_base_version < 1 then
    raise exception using errcode = '22023', message = 'period close input is invalid';
  end if;

  select * into v_fund from private.funds f where f.id = p_fund_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'fund not found'; end if;
  if not private.has_capability(v_fund.tree_id, 'treasury.approve', null) or not private.has_mfa() then
    raise exception using errcode = '42501', message = 'period close requires treasury approval and MFA';
  end if;
  select * into v_existing
  from private.idempotency_records r
  where r.tree_id = v_fund.tree_id and r.actor_id = v_actor
    and r.operation = 'fund.period_close'
    and r.idempotency_key = p_idempotency_key
    and r.expires_at > clock_timestamp()
  for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode = 'P0008', message = 'idempotent request is still in progress'; end if;
    return query select
      (v_existing.response->>'fundId')::uuid, (v_existing.response->>'from')::date,
      (v_existing.response->>'to')::date, v_existing.response->>'status',
      (v_existing.response->>'version')::bigint, v_existing.response->>'openingVnd',
      v_existing.response->>'incomeVnd', v_existing.response->>'expenseVnd',
      v_existing.response->>'closingVnd', (v_existing.response->>'postedEntries')::integer,
      (v_existing.response->>'proofTotal')::integer, (v_existing.response->>'proofReady')::integer,
      (v_existing.response->>'proofPending')::integer, (v_existing.response->>'proofMissing')::integer,
      (v_existing.response->>'proofRejected')::integer, (v_existing.response->>'lockedAt')::timestamptz;
    return;
  end if;

  if v_fund.version <> p_base_version then raise exception using errcode = 'P0009', message = 'fund version conflict'; end if;
  if v_fund.closed_through is not null and p_from <= v_fund.closed_through then
    raise exception using errcode = 'P0001', message = 'period overlaps an already closed range';
  end if;
  if exists (
    select 1 from private.journal_entries e
    where e.tree_id = v_fund.tree_id and e.fund_id = v_fund.id
      and e.entry_date between p_from and p_to
      and e.status in ('draft','submitted')
  ) then
    raise exception using errcode = 'P0001', message = 'period contains unposted journals';
  end if;
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at)
  values (v_fund.tree_id, v_actor, 'fund.period_close', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours');

  select * into v_report from private.fund_period_reconciliation(p_fund_id, p_from, p_to);
  insert into private.fund_period_closures (
    tree_id, fund_id, period_from, period_to, fund_version, status,
    opening_vnd, income_vnd, expense_vnd, closing_vnd, posted_entries,
    proof_total, proof_ready, proof_pending, proof_missing, proof_rejected, locked_by
  )
  values (
    v_fund.tree_id, v_fund.id, p_from, p_to, v_fund.version + 1, 'locked',
    v_report.opening_vnd, v_report.income_vnd, v_report.expense_vnd, v_report.closing_vnd,
    v_report.posted_entries, v_report.proof_total, v_report.proof_ready, v_report.proof_pending,
    v_report.proof_missing, v_report.proof_rejected, v_actor
  )
  returning * into v_closure;

  update private.funds as f
  set closed_through = p_to, version = f.version + 1
  where f.tree_id = v_fund.tree_id and f.id = v_fund.id;

  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary, metadata)
  values (
    v_fund.tree_id, v_actor, 'fund.period_locked', 'fund_period', v_closure.id, gen_random_uuid(),
    'Fund period locked with projection snapshot',
    jsonb_build_object('from', p_from, 'to', p_to, 'reason', btrim(p_reason), 'postedEntries', v_closure.posted_entries)
  );
  insert into private.outbox (tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values (
    v_fund.tree_id, 'fund.period_locked', v_closure.id, v_closure.fund_version,
    'fund.period_locked:' || v_closure.id::text, v_actor
  );

  update private.idempotency_records
  set response = jsonb_build_object(
    'fundId', v_closure.fund_id, 'from', v_closure.period_from, 'to', v_closure.period_to,
    'status', v_closure.status, 'version', v_closure.fund_version,
    'openingVnd', v_closure.opening_vnd, 'incomeVnd', v_closure.income_vnd,
    'expenseVnd', v_closure.expense_vnd, 'closingVnd', v_closure.closing_vnd,
    'postedEntries', v_closure.posted_entries, 'proofTotal', v_closure.proof_total,
    'proofReady', v_closure.proof_ready, 'proofPending', v_closure.proof_pending,
    'proofMissing', v_closure.proof_missing, 'proofRejected', v_closure.proof_rejected,
    'lockedAt', v_closure.locked_at
  )
  where tree_id = v_fund.tree_id and actor_id = v_actor
    and operation = 'fund.period_close' and idempotency_key = p_idempotency_key;

  return query select
    v_closure.fund_id, v_closure.period_from, v_closure.period_to, v_closure.status,
    v_closure.fund_version, v_closure.opening_vnd, v_closure.income_vnd, v_closure.expense_vnd,
    v_closure.closing_vnd, v_closure.posted_entries, v_closure.proof_total,
    v_closure.proof_ready, v_closure.proof_pending, v_closure.proof_missing,
    v_closure.proof_rejected, v_closure.locked_at;
end;
$$;

create or replace function api.fund_period_reconciliation(p_fund_id uuid, p_from date, p_to date)
returns table (
  fund_id uuid, from_date date, to_date date, status text, version bigint,
  opening_vnd text, income_vnd text, expense_vnd text, closing_vnd text,
  posted_entries integer, proof_total integer, proof_ready integer,
  proof_pending integer, proof_missing integer, proof_rejected integer, locked_at timestamptz
)
language sql security invoker
set search_path = pg_catalog
as $$ select * from private.fund_period_reconciliation($1, $2, $3); $$;

create or replace function api.fund_period_close(
  p_fund_id uuid, p_from date, p_to date, p_reason text, p_base_version bigint,
  p_idempotency_key uuid, p_request_hash text
)
returns table (
  fund_id uuid, from_date date, to_date date, status text, version bigint,
  opening_vnd text, income_vnd text, expense_vnd text, closing_vnd text,
  posted_entries integer, proof_total integer, proof_ready integer,
  proof_pending integer, proof_missing integer, proof_rejected integer, locked_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog
as $$ select * from private.fund_period_close_idempotent($1, $2, $3, $4, $5, $6, $7); $$;

revoke all on function private.prevent_closed_fund_journal_period() from public, anon, authenticated;
revoke all on function private.fund_period_reconciliation(uuid,date,date) from public, anon, authenticated;
revoke all on function private.fund_period_close_idempotent(uuid,date,date,text,bigint,uuid,text) from public, anon, authenticated;
grant execute on function private.fund_period_reconciliation(uuid,date,date) to authenticated;
grant execute on function private.fund_period_close_idempotent(uuid,date,date,text,bigint,uuid,text) to authenticated;
revoke all on function api.fund_period_reconciliation(uuid,date,date) from public, anon, authenticated;
revoke all on function api.fund_period_close(uuid,date,date,text,bigint,uuid,text) from public, anon, authenticated;
grant usage on schema api to authenticated;
grant execute on function api.fund_period_reconciliation(uuid,date,date) to authenticated;
grant execute on function api.fund_period_close(uuid,date,date,text,bigint,uuid,text) to authenticated;

commit;