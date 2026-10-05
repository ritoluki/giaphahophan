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

NOT_RUN: chunk planning/application, `partially_applied` continuation, cancellation after committed chunks, compensating undo, and conflict protection for later person edits/new references. M16-05 remains IN_PROGRESS. No real genealogy data or hosted DB used; no production deployment.
