# M16-04 row decisions — local evidence 2026-10-04

Environment: Windows, Node24.21.0/pnpm12.6.0, Supabase Docker `phan-gia-pha-local`, isolated Next16.3.3 artifact `.next-m16-row-decisions`, localhost:3127. Synthetic fixtures only; no hosted DB or production deploy.

PASS `pnpm.cmd test:m16:import`: exclusion, exact retry without version growth, changed retry rejection, independent approval, restore invalidating approval, old approval denial, fresh re-review/apply, skipped counters, unchanged raw/parser state and appliedEntities containing only written people. Existing2,000-person/security fixtures PASS; transaction rolls back.

PASS `TEST_WEB_URL=http://localhost:3127 pnpm.cmd test:m16:http`: real TOTP MFA; 320px form excludes/restores and survives reload; exact/changed row retries; AAL1 denial; independent review and canonical commit/reload/citations; asserted cleanup. [Synthetic screenshot](m16-review-320.png). Initial browser runs FAILed due test requests racing UI CSRF refresh; fixed synchronization and reran with all security assertions. Initial SQL constant-division assertion replaced with explicit boolean assertion and rerun PASS.

PASS tests contracts64/domain96/worker18/lunar4/web6; typecheck/lint (0errors,2existing warnings), production build, verify, OpenAPI/dictionary/state parse. Config/UI have no tests; no-test exits are not coverage.

IN_PROGRESS: full row inspection/correction, explicit relationship mapping, aliases/places, M16-05 chunk/cancel/compensation. Current form selects a source row by number; preview samples at most50. Exclusion never resolves ambiguous relationships or validates parser-invalid rows. Full manual accessibility/real-device/staging NOT_RUN. Real-tree/H5 import disabled. Migration0059 applied only to local Docker; historical0037 CLI-chain drift unresolved.
