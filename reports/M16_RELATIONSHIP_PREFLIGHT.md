# M16-04 relationship preflight — 2026-10-04

## Coverage hardening continuation

`planImportRelationships` now requires mapping membership to exactly cover each included FAM partner/child reference and reconciles GEDCOM forward (`HUSB`/`WIFE`/`CHIL`) against reverse `FAMS`/`FAMC` pointers. Missing reciprocal pointers and unselected included participants are rejected; explicitly excluded participants are not silently introduced. `pnpm.cmd --filter @phan/domain test`: PASS 104/104; domain typecheck PASS. This pure planner is defense-in-depth only and is not trusted for authorization or apply. Database coverage, merged canonical graph checks and atomic apply remain NOT_RUN; canonical relationship apply remains closed.

Migration0062 adds a DB trigger at private mapping persistence with equivalent per-family inclusion and GEDCOM reciprocal-pointer checks. PASS: applied twice locally (repeatable DDL), then `pnpm.cmd test:m16:import`; fixture saves a complete 2-partner/1-child family and confirms omitting one still-included partner raises SQLSTATE22023 without changing the saved mapping. Synthetic transaction rollback asserted. This does not prove all included FAM rows have a saved mapping, review authorization, merged existing graph validation or canonical apply; these remain NOT_RUN/fail-closed.

Migration0063 adds private predicate `private.import_relationship_batch_complete(job_id)` for whole-job row/error/identity/mapping/pointer coverage. PASS SQL fixture: false before mapping, true after full mapping. It is revoked from API roles and deliberately not wired into review or commit until canonical atomic apply is ready. Therefore whole-job authorization gate, merged-graph validation and relationship apply remain NOT_RUN/fail-closed.

Migration0064 adds private `private.import_relationship_graph_is_safe(job_id)`. It acquires the same tree-scoped transaction advisory lock as canonical parent-link apply, rechecks batch coverage, rejects repeated/existing parent-link keys, evaluates recursive reachability across existing confirmed biological/adoptive edges plus all proposed confirmed biological/adoptive links, and checks the combined distinct confirmed biological parent count. PASS: `pnpm.cmd test:m16:import` on local synthetic SQL, with F1 proposing I1→I2 and F2 proposing I2→I1; checker returns unsafe. The rollback fixture verifies no canonical relationship writes. This tests a proposed two-family cycle, not an existing canonical-edge interaction or full atomic commit. Checker remains private and unconnected to review/commit; apply stays closed.

## Persistence and editor verification

The local slice now includes the private decision table and GET/POST `/api/v1/imports/{id}/relationships`, plus an editor that distinguishes selected union members from explicit parent links. Relationship-only review rows are selectable only when their sole parser issue is `relationship_mapping_requires_review`; missing, excluded, invalid, duplicate or other-error source people remain blocked. The GET response is a bounded allowlist (family/person external IDs, display labels, parser status, exclusion flag and saved choices); raw payload and private reason are omitted.

PASS: authenticated local `pnpm.cmd test:m16:http` (isolated app on localhost:3129 + local Supabase, synthetic only): GEDCOM 5.5.1 HUSB/WIFE/CHIL records; AAL1 relationship mutation denied403, AAL2 reviewer loads editor and saves explicit disputed parent link, exact replay preserves version, changed payload under same key returns409, stale family cursor returns409, 320px viewport has no overflow, and canonical `unions`/`parent_links` remain unchanged. Cleanup asserted. The same run retains M16 review/apply and row exclusion/inspection coverage.

PASS: `pnpm.cmd test:m16:import` SQL transaction (rolled back), migration0061 local apply, full workspace tests (contracts66/domain103/worker18/lunar4/web6; config/UI no tests), typecheck, lint (0 errors/2 pre-existing warnings), verify, OpenAPI YAML parse, and optimized production build/standalone artifact.

NOT_RUN: total family-reference coverage across FAM + INDI `FAMS/FAMC` pointers, comparison to already-canonical graph under the migration0008 tree advisory lock, cycle/biological-parent-cap regression through the actual import transaction, and canonical union/parent-link/citation/manifest writes. The apply guard remains fail-closed for FAM and relation-bearing rows. No real or hosted DB data.

## Continuation: persistence slice (same day)

Added migration `0061_m16_relationship_mapping.sql` and `POST /api/v1/imports/{id}/relationships`. Decisions are stored in a private RLS-FORCE table, included in the current snapshot, and guarded by demo-tree, imports.manage, MFA, exact version/hash, one unique source FAM row, valid/included staged INDI participants, exact source FAM partner/child references, strict edge allowlists and idempotency. Saving increments version, invalidates prior approval and writes a redacted audit event. It deliberately writes no canonical union/parent link and does not yet authorize family apply.

PASS: migration applied to local Docker Supabase; `pnpm.cmd test:m16:import` completed using the rollback-only synthetic fixture. The fixture proves persisted decision count, changed snapshot, exact same-key replay, stale snapshot denial, and unchanged canonical `parent_links`; contracts65 and contracts/web typechecks PASS. No hosted DB, production or real-family data.

NOT_RUN: authenticated HTTP/browser for the new endpoint; read projection/editor; whole-batch family and INDI pointer coverage; current canonical graph cycle and biological-parent checks under the shared ancestry lock; atomic union/parent-link/citation apply. Existing apply stays fail-closed for these rows.

Local Node24.21.0, pnpm12.6.0, Vitest4.1.11; synthetic fixtures only. No DB/API/UI canonical relationship write added by this slice.

PASS `pnpm.cmd --filter @phan/domain test`:103 tests including7 new preflight tests. Tested union grouping with no invented parents/sex; explicit kind/status/reason and snapshot/version; absent/excluded/duplicate external identities; cycle across families; disputed/guardian ancestry exclusion; duplicate links, biological-parent cap, self-parent, duplicate family and bounded total work. Existing source records including unmapped SOUR are retained at parser boundary; preflight only selects relationship fields and never interprets notes.

PASS workspace typecheck/lint (0errors,2existing warnings). Previous inspector build/browser/SQL evidence remains in M16_ROW_INSPECTION.md; it does not prove relationship persistence/apply.

Final full workspace tests PASS contracts65/domain103/worker18/lunar4/web6; config/UI have no tests. Contract reconciliation initially FAILed on duplicate OpenAPI/type declarations; removed the repeated definitions and reran parse/typecheck. No package/dependency added and no approved visual asset changed.

IN_PROGRESS: source/decision persistence, authorized mapping UI and atomic union/parent-link apply under ancestry lock, complete family-coverage checks and revalidation against existing canonical graph. Preflight valid means only supplied decisions pass domain rules, not that the import is ready. Existing scalar DB gate still rejects FAM/unresolved relationship rows. No owner approval required for subsequent synthetic implementation.
