-- M15-03: award approval is distinct from paid/reversed journal state.
begin;

create table private.scholarship_awards (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  application_id uuid not null,
  fund_id uuid not null,
  amount_vnd bigint not null check (amount_vnd > 0 and amount_vnd <= 999999999999999999),
  reason text not null check (length(btrim(reason)) between 1 and 4000),
  approved_by uuid not null references auth.users(id),
  paid_journal_entry_id uuid,
  reversal_journal_entry_id uuid,
  status text not null default 'approved' check (status in ('approved','paid','reversed','withdrawn')),
  unique(tree_id,id),
  unique(tree_id,application_id),
  foreign key(tree_id,application_id) references private.scholarship_applications(tree_id,id),
  foreign key(tree_id,fund_id) references private.funds(tree_id,id),
  foreign key(tree_id,fund_id,paid_journal_entry_id) references private.journal_entries(tree_id,fund_id,id),
  foreign key(tree_id,fund_id,reversal_journal_entry_id) references private.journal_entries(tree_id,fund_id,id),
  check (reversal_journal_entry_id is null or status='reversed')
);
create unique index scholarship_awards_one_paid_journal_idx on private.scholarship_awards(tree_id,paid_journal_entry_id) where paid_journal_entry_id is not null;
create unique index scholarship_awards_one_reversal_idx on private.scholarship_awards(tree_id,reversal_journal_entry_id) where reversal_journal_entry_id is not null;
drop trigger if exists touch_scholarship_awards on private.scholarship_awards;
create trigger touch_scholarship_awards before update on private.scholarship_awards for each row execute function private.touch_updated_at();
alter table private.scholarship_awards enable row level security;
alter table private.scholarship_awards force row level security;

create or replace function private.scholarship_award_create_idempotent(p_application_id uuid,p_amount_vnd bigint,p_reason text,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,application_id uuid,fund_id uuid,amount_vnd bigint,reason text,approved_by uuid,paid_journal_entry_id uuid,reversal_journal_entry_id uuid,status text)
language plpgsql security definer set search_path=pg_catalog,private
as $$
declare v_actor uuid:=auth.uid(); v_app private.scholarship_applications%rowtype; v_program private.scholarship_programs%rowtype; v_existing private.idempotency_records%rowtype; v_award private.scholarship_awards%rowtype; v_inserted integer;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if not private.has_mfa() then raise exception using errcode='42501',message='award approval requires aal2'; end if;
  if p_amount_vnd is null or p_amount_vnd<=0 or p_amount_vnd>999999999999999999 then raise exception using errcode='22023',message='award amount is outside allowed range'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>4000 then raise exception using errcode='22023',message='award reason is required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash),'') is null then raise exception using errcode='22023',message='idempotency key and request hash are required'; end if;
  select * into v_app from private.scholarship_applications a where a.id=p_application_id;
  if not found then raise exception using errcode='P0002',message='scholarship application not found'; end if;
  if not private.has_capability(v_app.tree_id,'scholarship.review',null) and not private.has_capability(v_app.tree_id,'scholarship.manage',null) then raise exception using errcode='42501',message='scholarship review capability required'; end if;
  if v_app.submitted_by=v_actor then raise exception using errcode='42501',message='submitter cannot approve own award'; end if;
  if v_app.status<>'approved' then raise exception using errcode='P0003',message='only approved applications can receive an award'; end if;
  select * into v_program from private.scholarship_programs p where p.id=(select a.program_id from private.scholarship_applications a where a.id=p_application_id);

  delete from private.idempotency_records r where r.tree_id=v_app.tree_id and r.actor_id=v_actor and r.operation='scholarship.award.create' and r.idempotency_key=p_idempotency_key and r.expires_at<=clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,expires_at) values(v_app.tree_id,v_actor,'scholarship.award.create',p_idempotency_key,p_request_hash,clock_timestamp()+interval '24 hours') on conflict(tree_id,actor_id,operation,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id=v_app.tree_id and r.actor_id=v_actor and r.operation='scholarship.award.create' and r.idempotency_key=p_idempotency_key for update;
  if v_inserted=0 then
    if v_existing.request_hash<>p_request_hash then raise exception using errcode='P0008',message='idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode='P0008',message='idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid,(v_existing.response->>'version')::bigint,(v_existing.response->>'applicationId')::uuid,(v_existing.response->>'fundId')::uuid,(v_existing.response->>'amountVnd')::bigint,v_existing.response->>'reason',(v_existing.response->>'approvedBy')::uuid,(v_existing.response->>'paidJournalEntryId')::uuid,(v_existing.response->>'reversalJournalEntryId')::uuid,v_existing.response->>'status'; return;
  end if;
  insert into private.scholarship_awards(tree_id,created_by,application_id,fund_id,amount_vnd,reason,approved_by,status) values(v_app.tree_id,v_actor,v_app.id,v_program.fund_id,p_amount_vnd,btrim(p_reason),v_actor,'approved') returning * into v_award;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary,metadata) values(v_award.tree_id,v_actor,'scholarship.award.approved','scholarship_award',v_award.id,gen_random_uuid(),'Award approved; payment requires a separately posted journal',jsonb_build_object('applicationId',v_award.application_id,'amountVnd',v_award.amount_vnd));
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by) values(v_award.tree_id,'scholarship.award.approved',v_award.id,v_award.version,'scholarship.award.approved:'||v_award.id::text||':'||v_award.version::text,v_actor);
  update private.idempotency_records r set response=jsonb_build_object('id',v_award.id,'version',v_award.version,'applicationId',v_award.application_id,'fundId',v_award.fund_id,'amountVnd',v_award.amount_vnd,'reason',v_award.reason,'approvedBy',v_award.approved_by,'paidJournalEntryId',v_award.paid_journal_entry_id,'reversalJournalEntryId',v_award.reversal_journal_entry_id,'status',v_award.status) where r.tree_id=v_award.tree_id and r.actor_id=v_actor and r.operation='scholarship.award.create' and r.idempotency_key=p_idempotency_key;
  return query select v_award.id,v_award.version,v_award.application_id,v_award.fund_id,v_award.amount_vnd,v_award.reason,v_award.approved_by,v_award.paid_journal_entry_id,v_award.reversal_journal_entry_id,v_award.status;
exception when unique_violation then raise exception using errcode='P0003',message='this application already has an award';
end;
$$;

create or replace function private.scholarship_award_mark_paid_idempotent(p_award_id uuid,p_posted_journal_entry_id uuid,p_base_version bigint,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,application_id uuid,fund_id uuid,amount_vnd bigint,reason text,approved_by uuid,paid_journal_entry_id uuid,reversal_journal_entry_id uuid,status text)
language plpgsql security definer set search_path=pg_catalog,private
as $$
declare v_actor uuid:=auth.uid(); v_award private.scholarship_awards%rowtype; v_entry private.journal_entries%rowtype; v_existing private.idempotency_records%rowtype; v_updated private.scholarship_awards%rowtype; v_expense bigint; v_inserted integer;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if not private.has_mfa() or p_idempotency_key is null or nullif(btrim(p_request_hash),'') is null then raise exception using errcode='42501',message='payment requires aal2 and idempotency'; end if;
  select * into v_award from private.scholarship_awards a where a.id=p_award_id for update;
  if not found then raise exception using errcode='P0002',message='scholarship award not found'; end if;
  if not private.has_capability(v_award.tree_id,'treasury.approve',null) then raise exception using errcode='42501',message='treasury approval capability required'; end if;
  if v_award.approved_by=v_actor then raise exception using errcode='42501',message='award approver cannot mark own award paid'; end if;
  if v_award.status<>'approved' then raise exception using errcode='P0003',message='only approved awards can be marked paid'; end if;
  select * into v_entry from private.journal_entries e where e.id=p_posted_journal_entry_id and e.tree_id=v_award.tree_id for share;
  if not found or v_entry.fund_id<>v_award.fund_id or v_entry.status<>'posted' then raise exception using errcode='P0003',message='payment journal must be posted in the award fund'; end if;
  if v_entry.submitted_by=v_actor or v_entry.approved_by is null then raise exception using errcode='42501',message='payment journal must have an independent approval'; end if;
  select coalesce(sum(l.signed_amount_vnd),0) into v_expense from private.journal_lines l join private.fund_accounts fa on fa.tree_id=l.tree_id and fa.id=l.account_id and fa.fund_id=l.fund_id where l.tree_id=v_award.tree_id and l.entry_id=v_entry.id and fa.kind='expense' and l.signed_amount_vnd>0;
  if v_expense<>v_award.amount_vnd then raise exception using errcode='P0001',message='payment journal expense does not equal award amount'; end if;

  delete from private.idempotency_records r where r.tree_id=v_award.tree_id and r.actor_id=v_actor and r.operation='scholarship.award.mark_paid' and r.idempotency_key=p_idempotency_key and r.expires_at<=clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,expires_at) values(v_award.tree_id,v_actor,'scholarship.award.mark_paid',p_idempotency_key,p_request_hash,clock_timestamp()+interval '24 hours') on conflict(tree_id,actor_id,operation,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id=v_award.tree_id and r.actor_id=v_actor and r.operation='scholarship.award.mark_paid' and r.idempotency_key=p_idempotency_key for update;
  if v_inserted=0 then
    if v_existing.request_hash<>p_request_hash then raise exception using errcode='P0008',message='idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode='P0008',message='idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid,(v_existing.response->>'version')::bigint,(v_existing.response->>'applicationId')::uuid,(v_existing.response->>'fundId')::uuid,(v_existing.response->>'amountVnd')::bigint,v_existing.response->>'reason',(v_existing.response->>'approvedBy')::uuid,(v_existing.response->>'paidJournalEntryId')::uuid,(v_existing.response->>'reversalJournalEntryId')::uuid,v_existing.response->>'status'; return;
  end if;
  if p_base_version<>v_award.version then raise exception using errcode='P0009',message='award version is stale'; end if;
  update private.scholarship_awards a set status='paid',paid_journal_entry_id=v_entry.id,updated_at=clock_timestamp() where a.id=v_award.id and a.version=p_base_version returning * into v_updated;
  if not found then raise exception using errcode='P0009',message='award version is stale'; end if;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary,metadata) values(v_updated.tree_id,v_actor,'scholarship.award.marked_paid','scholarship_award',v_updated.id,gen_random_uuid(),'Award linked once to a posted journal; no bank synchronization',jsonb_build_object('journalEntryId',v_entry.id,'amountVnd',v_updated.amount_vnd));
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by) values(v_updated.tree_id,'scholarship.award.marked_paid',v_updated.id,v_updated.version,'scholarship.award.marked_paid:'||v_updated.id::text||':'||v_updated.version::text,v_actor);
  update private.idempotency_records r set response=jsonb_build_object('id',v_updated.id,'version',v_updated.version,'applicationId',v_updated.application_id,'fundId',v_updated.fund_id,'amountVnd',v_updated.amount_vnd,'reason',v_updated.reason,'approvedBy',v_updated.approved_by,'paidJournalEntryId',v_updated.paid_journal_entry_id,'reversalJournalEntryId',v_updated.reversal_journal_entry_id,'status',v_updated.status) where r.tree_id=v_updated.tree_id and r.actor_id=v_actor and r.operation='scholarship.award.mark_paid' and r.idempotency_key=p_idempotency_key;
  return query select v_updated.id,v_updated.version,v_updated.application_id,v_updated.fund_id,v_updated.amount_vnd,v_updated.reason,v_updated.approved_by,v_updated.paid_journal_entry_id,v_updated.reversal_journal_entry_id,v_updated.status;
end;
$$;

create or replace function private.sync_scholarship_award_reversal()
returns trigger language plpgsql security definer set search_path=pg_catalog,private as $$
begin
  if new.status='posted' and new.reverses_entry_id is not null then
    update private.scholarship_awards a set status='reversed',reversal_journal_entry_id=new.id,updated_at=clock_timestamp() where a.tree_id=new.tree_id and a.paid_journal_entry_id=new.reverses_entry_id and a.status='paid';
  end if;
  return new;
end;
$$;
drop trigger if exists sync_scholarship_award_reversal on private.journal_entries;
create trigger sync_scholarship_award_reversal after update of status on private.journal_entries for each row execute function private.sync_scholarship_award_reversal();

create or replace function api.scholarship_award_create(p_application_id uuid,p_amount_vnd bigint,p_reason text,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,application_id uuid,fund_id uuid,amount_vnd bigint,reason text,approved_by uuid,paid_journal_entry_id uuid,reversal_journal_entry_id uuid,status text) language sql security invoker set search_path=pg_catalog,private as $$ select * from private.scholarship_award_create_idempotent($1,$2,$3,$4,$5); $$;
create or replace function api.scholarship_award_mark_paid(p_award_id uuid,p_posted_journal_entry_id uuid,p_base_version bigint,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,application_id uuid,fund_id uuid,amount_vnd bigint,reason text,approved_by uuid,paid_journal_entry_id uuid,reversal_journal_entry_id uuid,status text) language sql security invoker set search_path=pg_catalog,private as $$ select * from private.scholarship_award_mark_paid_idempotent($1,$2,$3,$4,$5); $$;

revoke all on table private.scholarship_awards from public,anon,authenticated;
revoke all on function private.scholarship_award_create_idempotent(uuid,bigint,text,uuid,text),private.scholarship_award_mark_paid_idempotent(uuid,uuid,bigint,uuid,text),private.sync_scholarship_award_reversal() from public,anon,authenticated;
grant execute on function private.scholarship_award_create_idempotent(uuid,bigint,text,uuid,text),private.scholarship_award_mark_paid_idempotent(uuid,uuid,bigint,uuid,text) to authenticated;
grant execute on function api.scholarship_award_create(uuid,bigint,text,uuid,text),api.scholarship_award_mark_paid(uuid,uuid,bigint,uuid,text) to authenticated;
commit;