begin;

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

  delete from private.idempotency_records r where r.tree_id=v_award.tree_id and r.actor_id=v_actor and r.operation='scholarship.award.mark_paid' and r.idempotency_key=p_idempotency_key and r.expires_at<=clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,expires_at) values(v_award.tree_id,v_actor,'scholarship.award.mark_paid',p_idempotency_key,p_request_hash,clock_timestamp()+interval '24 hours') on conflict(tree_id,actor_id,operation,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id=v_award.tree_id and r.actor_id=v_actor and r.operation='scholarship.award.mark_paid' and r.idempotency_key=p_idempotency_key for update;
  if v_inserted=0 then
    if v_existing.request_hash<>p_request_hash then raise exception using errcode='P0008',message='idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode='P0008',message='idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid,(v_existing.response->>'version')::bigint,(v_existing.response->>'applicationId')::uuid,(v_existing.response->>'fundId')::uuid,(v_existing.response->>'amountVnd')::bigint,v_existing.response->>'reason',(v_existing.response->>'approvedBy')::uuid,(v_existing.response->>'paidJournalEntryId')::uuid,(v_existing.response->>'reversalJournalEntryId')::uuid,v_existing.response->>'status'; return;
  end if;

  if v_award.status<>'approved' then raise exception using errcode='P0003',message='only approved awards can be marked paid'; end if;
  select * into v_entry from private.journal_entries e where e.id=p_posted_journal_entry_id and e.tree_id=v_award.tree_id for share;
  if not found or v_entry.fund_id<>v_award.fund_id or v_entry.status<>'posted' then raise exception using errcode='P0003',message='payment journal must be posted in the award fund'; end if;
  if v_entry.submitted_by=v_actor or v_entry.approved_by is null then raise exception using errcode='42501',message='payment journal must have an independent approval'; end if;
  select coalesce(sum(l.signed_amount_vnd),0) into v_expense from private.journal_lines l join private.fund_accounts fa on fa.tree_id=l.tree_id and fa.id=l.account_id and fa.fund_id=l.fund_id where l.tree_id=v_award.tree_id and l.entry_id=v_entry.id and fa.kind='expense' and l.signed_amount_vnd>0;
  if v_expense<>v_award.amount_vnd then raise exception using errcode='P0001',message='payment journal expense does not equal award amount'; end if;
  if p_base_version<>v_award.version then raise exception using errcode='P0009',message='award version is stale'; end if;
  update private.scholarship_awards a set status='paid',paid_journal_entry_id=v_entry.id,updated_at=clock_timestamp() where a.id=v_award.id and a.version=p_base_version returning * into v_updated;
  if not found then raise exception using errcode='P0009',message='award version is stale'; end if;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary,metadata) values(v_updated.tree_id,v_actor,'scholarship.award.marked_paid','scholarship_award',v_updated.id,gen_random_uuid(),'Award linked once to a posted journal; no bank synchronization',jsonb_build_object('journalEntryId',v_entry.id,'amountVnd',v_updated.amount_vnd));
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by) values(v_updated.tree_id,'scholarship.award.marked_paid',v_updated.id,v_updated.version,'scholarship.award.marked_paid:'||v_updated.id::text||':'||v_updated.version::text,v_actor);
  update private.idempotency_records r set response=jsonb_build_object('id',v_updated.id,'version',v_updated.version,'applicationId',v_updated.application_id,'fundId',v_updated.fund_id,'amountVnd',v_updated.amount_vnd,'reason',v_updated.reason,'approvedBy',v_updated.approved_by,'paidJournalEntryId',v_updated.paid_journal_entry_id,'reversalJournalEntryId',v_updated.reversal_journal_entry_id,'status',v_updated.status) where r.tree_id=v_updated.tree_id and r.actor_id=v_actor and r.operation='scholarship.award.mark_paid' and r.idempotency_key=p_idempotency_key;
  return query select v_updated.id,v_updated.version,v_updated.application_id,v_updated.fund_id,v_updated.amount_vnd,v_updated.reason,v_updated.approved_by,v_updated.paid_journal_entry_id,v_updated.reversal_journal_entry_id,v_updated.status;
end;
$$;

commit;
