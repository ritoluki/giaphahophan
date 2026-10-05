# M16-05 partial, cancel and compensation

## Ticket plan

1. Keep imports of up to 2,000 included people atomic; never describe an atomic rollback as partial.
2. Add a private immutable chunk plan bound to the approved source snapshot. Each chunk has a stable sequence/range/hash, independent idempotency record, and committed counters. Apply one chunk per RPC transaction; serialize on the job row and recheck actor capability, AAL2, demo mode, snapshot/version and graph lock.
3. Cancellation prevents only later chunks. A job with committed chunks must remain `partially_applied` or become `cancelled` with exact completed-chunk/entity manifest; it must never imply rollback.
4. Compensation is a separate audited operation. Delete only import-created entities whose versions are unchanged and whose dependencies/references are still exclusively owned by the import. If any row changed or gained a reference, refuse atomically and report a conflict; never erase subsequent edits.
5. Test retry/replay, cancellation races, stale versions, partial persistence, changed/referenced compensation conflicts, permissions, cleanup, and mobile status UI on synthetic local data.

## Implemented vertical slice — 2026-10-06

Migration `0067_m16_cancel_unapplied.sql` and `POST /api/v1/imports/{id}/cancel` provide a safe first step. Cancellation accepts only `needs_review` or `ready` jobs, requires imports.manage, AAL2, demo-tree mode, exact version, an idempotency key and a reason. It locks the job row, invalidates approval, writes a redacted audit event, and records only a SHA-256 digest of the reason in the private manifest. It also verifies that neither the manifest nor stable external-ID map points at canonical people/unions. The original restricted source and staging remain available; no canonical data is deleted.

The responsive import screen exposes the cancellation form only when the authorized state projection says `canCancel`; it explains the no-canonical-write boundary, disables empty/short submissions, reports pending/error states, and reloads persisted state. The DB mutation repeats every authorization/state check; UI visibility is not authorization.

PASS: local Supabase migration apply/reapply and authenticated `pnpm.cmd test:m16:http` at a 320px viewport. The synthetic owner cancels an unapplied import with a valid reason; job status persists as `cancelled`, exact request replay returns the same state, changed payload on the same key returns409, `canCancel` becomes false, completed imports expose no cancellation capability, and fixture cleanup passes. Review-state contract/OpenAPI and cancel-input contract test updated.

The preceding NOT_RUN list describes the first cancellation-only slice; the new chunk evidence below supersedes it.

## Chunk transactions — 2026-10-06

Migration0068 adds FORCE-RLS private immutable chunk plans and a durable per-chunk result/replay ledger, plus exact ownership snapshots of import-created canonical rows. It shares the existing canonical-write helper with atomic apply, keeping the 2,000-person atomic boundary and permitting independently reviewed batches up to the existing 10,000-record intake limit. A chunk creates up to500 people; subsequent family chunks create one whole family and its explicitly reviewed edges after all people exist. Every request locks the job, rechecks active capability/AAL2/demo mode, independent reviewer, version, immutable source/staging and merged graph under the canonical tree lock. Changed earlier canonical rows prevent further apply. A failed chunk transaction rolls back its own writes while retaining all prior chunks.

Cancellation serializes on the same job row, invalidates approval and stops future chunks. Its projection retains exact committed counts and private source/staging/ownership evidence. It does not delete canonical rows. GET state retains an existing valid CSRF token so refreshing another tab does not silently invalidate an open form.

PASS local Supabase `pnpm.cmd test:m16:import`: existing atomic regressions,2501 people in6 chunks, durable exact replay after completion, changed/stale/out-of-order/AAL1/reviewer denial, changed prior person denial, injected midway person collision with rollback of only the failed chunk, cancellation after500 persisted people, and people-first two-family graph continuation. Synthetic transaction rolled back. Fixture: `supabase/tests/m16_chunk_transactions.sql`.

PASS local authenticated Chromium `pnpm.cmd test:m16:http` at320px: independent UI review of2501 people, first500-person chunk, page reload, second chunk, durable retry without duplication, changed replay409, cancellation retains1000 people and2/6 chunks, further apply409, no horizontal overflow, DB count assertions and fixture cleanup. Screenshot: [partial import](m16-chunks-320.png). Earlier atomic/GEDCOM/MFA/CSRF tests also PASS. Initial browser runs failed on a missing disabled reviewer control and CSRF rotation; both were corrected before this PASS.

PASS workspace tests: contracts68/domain104/worker18/lunar4/web6; config/UI have no test files. Typecheck, lint (0errors/2existing warnings), isolated production build `.next-m16-chunks`, foundation verify and OpenAPI YAML parse PASS. Build is local only; preview served atlocalhost:3100. No real/hosted data or production deployment.

The following evidence supersedes the earlier NOT_RUN compensation/concurrency items.

## Independently reviewed compensation and races — 2026-10-06

Migration0069 adds a FORCE-RLS private compensation review and `/api/v1/imports/{id}/compensation`. Request, independent AAL2 approval and requester commit are separate versioned/idempotent actions. Every action checks active imports.manage and demo-tree mode. Commit checks exact immutable ownership snapshots and refuses the entire undo if an imported row changed or gained an external reference, including polymorphic/JSON references. It deletes only unchanged import-created canonical rows; original private media, staging, stable identity reservations and audit evidence remain. This is compensation, not privacy erasure. Older imports without ownership snapshots cannot use this path.

Commit takes transaction-scoped SHARE ROW EXCLUSIVE locks on private business tables before rechecking references and deleting. This conservative local implementation prevents a new reference slipping between validation and deletion; deadlock/timeout aborts atomically and returns a retryable typed error. Lock contention/load acceptance remains an explicit staging gate, not a production-ready claim.

PASS local `pnpm.cmd test:m16:import`: separate review, self-review/unapproved/AAL1 rejection, changed-person conflict, new alias FK conflict, proposal-item polymorphic reference conflict, valid scoped undo, preserved original asset/staging/stable map, exact retry and changed retry refusal. SQL fixture `supabase/tests/m16_compensation.sql` rolls back.

PASS local `pnpm.cmd test:m16:concurrency`: independent PostgreSQL sessions race identical chunk replay (500 created once), apply-first/stale-cancel and cancel-first/later-chunk (1000 retained), reference-writer-first/compensation refusal, and compensation-first/late FK writer refusal. Exact synthetic cleanup asserted. Harness: `scripts/test-m16-chunk-concurrency-local.mjs`.

PASS local authenticated Chromium `pnpm.cmd test:m16:http`: at320px, requester creates compensation review, self-review403, second actor approves, requester reloads and undoes1000 people; DB proves canonical deletion while2501 staging rows and original asset persist. Exact retry and no horizontal overflow verified; cleanup succeeds. Screenshot: [compensation](m16-compensation-320.png). Initial runs exceeded the8-second statement timeout during reference scanning; typed UUID joins and materialized scope/candidate filtering fixed the scan before the final successful run.

PASS workspace tests contracts69/domain104/worker18/lunar4/web6, typecheck, lint (0errors/2known warnings), isolated production build `.next-m16-compensation`, foundation verify and OpenAPI parse. All evidence is local synthetic only. Remaining NOT_RUN: clean install/staging, lock-contention load acceptance, full manual accessibility/real devices and production gates. M16-05 remains IN_PROGRESS; no production deployment or real-data approval inferred.
