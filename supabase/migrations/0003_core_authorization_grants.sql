-- Minimum grants for the validated CORE-01 helpers.
-- No raw private table, sequence, or broad function grant is opened.

begin;

grant usage on schema private to anon, authenticated;

grant execute on function private.person_get_authorized(uuid) to anon, authenticated;
grant execute on function private.proposal_submit_authorized(uuid, text, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function private.proposal_review_authorized(uuid, text, text, bigint, text) to authenticated;

commit;
