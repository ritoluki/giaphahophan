# M16 export origin regression — local, 2026-10-14

Plan: reproduce the owner's save failure on127.0.0.1, inspect shared import/export CSRF guard, preserve fail-closed protections, add negative tests, run authenticated browser save + actual worker/download before restarting demo. No owner account or posted MFA secret used.

FAIL reproduced before fix: standalone `.next-mfa-fix`, local Supabase, synthetic account+MFA, authorized export context/token; POST export on127.0.0.1 returned403. Earlier integration harness used localhost and missed this host difference. Test fixtures cleaned.

Cause: shared guard compared browser Origin to Next's internally reconstructed request URL rather than the configured public origin. Refreshing CSRF cookie/token cannot fix that comparison. Same generic CSRF message misleadingly described both origin and token failures as expired confirmation.

Fix: strict exact comparison to trusted runtime NEXT_PUBLIC_APP_URL origin; no client-controlled forwarded-host allowlist. Missing/foreign origins and malformed deployment config fail closed. Separate ORIGIN_INVALID from CSRF_INVALID; token format, constant-time cookie/token comparison, user auth, MFA/RLS and idempotency retained. Context7 Next.js origin/host guidance informed the distinction between internal and public origin; these endpoints are Route Handlers, not Server Actions.

PASS:29 web unit tests/8 files and web typecheck, lint0errors/2existing warnings; local55-route build. Actual `M16_HTTP_TEST_DIST=.next-export-csrf node --import ./apps/worker/node_modules/tsx/dist/loader.mjs scripts/test-m16-export-download-http-local.mjs` PASS: foreign-origin/missing-token/mismatched-token403, Chromium320 export form refresh/save202 and saved job/no overflow, actual worker/private Storage/PDF download with headers/signature, anonymous401/sidecar404. Synthetic user/tree/job/object cleanup passed. No recorded browser secrets.

Negative tests exposed compiler-inlined public env even through an alias; runtime config now uses Reflect.get narrowed from unknown. Failed intermediate runs are not passing acceptance.

Demo: Next18924 .next-export-csrf on127.0.0.1:3100, worker15856 retained, ignored logs reports/local/demo-export-csrf-20261014, export page HTTP200. Staging/production NOT_RUN. Media policy pending; includeMedia not approved.
