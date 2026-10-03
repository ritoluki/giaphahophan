# M16-04 complete-row inspection — 2026-10-04

Environment: Windows Node24.21.0/pnpm12.6.0; Supabase Docker local; isolated Next16.3.3 `.next-m16-inspection`, localhost:3129. Synthetic data only.

PASS `pnpm.cmd test:m16:import`: 2,000-row first/second/last keyset pages, max50, stable row order, no raw payload and stale job version denial. Existing row-decision/approval/apply/capacity fixtures PASS; transaction rolled back.

PASS `TEST_WEB_URL=http://localhost:3129 pnpm.cmd test:m16:http`: mobile320px traverses51-row source, selects row51 into decision form, excludes it, reloads and sees persisted exclusion; previous source marker absent from response, stale cursor returns409 and no horizontal overflow. Existing MFA, review/apply, privacy/replay/CSRF fixtures PASS; cleanup asserted. Screenshot: [row51 mobile](m16-inspection-320.png).

PASS contracts65 tests, workspace typecheck/lint (0errors/2existing warnings), isolated production build, verify and OpenAPI parse. Full workspace tests64/96/18/4/6 were run at previous row-decision phase; new contract test rerun65. Final typed request-ID rendering change checked by typecheck/lint; browser evidence concerns the core inspector artifact.

IN_PROGRESS: normalized field correction, explicit relationship mapping, aliases/places, M16-05 and full manual accessibility/real-device/staging. Reading every row summary is not relationship review or field correction. No production/real-data approval inferred. Only migration0060 applied directly to local Docker; historical0037 CLI-chain drift still unresolved.
