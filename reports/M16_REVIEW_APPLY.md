# M16-04 atomic demo review/apply evidence — 2026-10-03

2026-10-04 continuation: PASS fresh local SQL fixture after source-media `FOR SHARE` locking; PASS typecheck/lint (same two warnings), isolated production build `.next-m16-review-check` and authenticated browser/HTTP regression at localhost:3126 after strict hexadecimal validation of both CSRF token and cookie. Cleanup is asserted by the harness. No owner action needed for subsequent row-decision work.

Environment: Windows, Node 24.21.0, pnpm 12.6.0, Supabase Docker `phan-gia-pha-local`, isolated Next 16.3.3 production artifact `.next-m16-review-final` at localhost:3124. No hosted DB, real genealogy data or production deployment.

PASS `pnpm.cmd test:m16:import`: independent reviewer/MFA, self-review and AAL1 denial, stale/tampered snapshots, stable UUIDs, restricted persons and birth facts with source citations, exact completed replay, changed-request denial and atomic capacity of 2,000 synthetic people. The fixture rolls back its transaction.

PASS `TEST_WEB_URL=http://localhost:3124 pnpm.cmd test:m16:http`: two synthetic browser users, real TOTP enrollment/challenge/verification, review UI at 320px, commit persistence and reload, exact commit replay, changed request/CSRF/AAL1 denial, fresh-key re-import of completed content and canonical/citation/audit counts. Fixture cleanup is asserted. [Mobile screenshot](m16-review-320.png) shows synthetic review state; it does not prove DB authorization.

PASS workspace tests: contracts 63, domain 96, worker 18, lunar 4, web 6. Config/UI packages have no tests; their no-test exits are not coverage. PASS typecheck, production build, verify, lint (0 errors; 2 existing warnings), OpenAPI/data dictionary parse and diff whitespace checks.

M16-04 remains IN_PROGRESS. Family/relationship mapping, excluded/corrected-row workflow and alias/place reconciliation still need implementation; unsupported or review rows cannot apply. M16-05 owns chunk/partial/cancel/compensation. Full manual accessibility, real devices, staging and production remain NOT_RUN. Normal CLI migration-chain verification remains blocked by existing 0037 local history drift; 0058 was applied directly to local Docker only.
