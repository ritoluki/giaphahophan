# Báo cáo kiểm thử ứng dụng

Application status: FOUNDATION_P1_P2_LOCAL_EXECUTED; product acceptance remains NOT_RUN. Không dùng PACKAGE_VALIDATION.json để đổi trạng thái ứng dụng.

| Nhóm | Trạng thái | Evidence |
|---|---|---|
| Lint ứng dụng | PASS | `pnpm lint`, local Windows Node 24.21.0, exit 0; 1 warning PostCSS không error |
| Typecheck ứng dụng/packages | PASS | `pnpm typecheck`, local Windows Node 24.21.0, exit 0 |
| Build foundation + P1 demo | PASS | `pnpm build`, Next 16.3.3, Node 24.21.0, exit 0; 15 app routes + health/API routes trong log |
| Unit/domain/property | PASS (foundation + contracts) | `pnpm test`, Vitest 4.1.11; 7 tests pass across domain/contracts; empty suites explicitly passWithNoTests |
| Local HTTP smoke | PASS (P1 demo only) | Standalone artifact `apps/web/.next/standalone/apps/web/server.js`; `/`, `/tra-cuu?q=Phan`, `/gia-pha`, `/nguoi/0e6ee4e5-9816-52b8-bc8b-33d7c79efe9c`, `/lich-ho`, `/tu-lieu`, `/api/v1/health/live` đều 200; `/api/v1/health/ready` vẫn 503 degraded khi DB chưa cấu hình |
| DB/RLS/authorization/concurrency | PARTIAL | Supabase local stack healthy; migrations 0001–0004 applied. pnpm test:db PASS synthetic projection/capability/proposal/review/audit/outbox, cross-tree restricted read/proposal denial and raw-table denial; authenticated proposal/review persistence PASS; concurrency/full RLS matrix remain NOT_RUN. |
| API contract/integration | PARTIAL | People API local smoke returned HTTP 400/404; proposal/review invalid-payload smoke returned HTTP 400; pnpm test:auth PASS BFF login, authenticated submit, self-review 403, independent review and persistence. Projection apply policy, concurrency and cross-tree API matrix remain NOT_RUN. |
| E2E local/staging | PASS (local demo only) | `pnpm test:e2e`, production build + standalone server, 10/10 tests PASS across desktop Chromium and Pixel 5 mobile; admin preview included |
| Lunar golden + roundtrip | NOT_RUN | — |
| Accessibility/real mobile | PARTIAL | Semantic smoke PASS 18/18: skip-link focus, main landmark, image alt presence and visible touch-target checks; full axe/manual/real-device audit not run |
| Performance/load | NOT_RUN | — |
| Security review | NOT_RUN | — |
| DB + object restore drill | NOT_RUN | — |
| Visual screenshot evidence | PASS (local demo only) | `reports/design-review/`: 18 screenshots for home/person/family-focus/calendar/sources/admin at desktop 1440px, Pixel 5 and 320px; H1 reviewer approval PENDING |
| Production smoke/rollback | NOT_RUN | No production endpoint/approval; deploy intentionally not attempted |

## Test command records

- `pnpm install --frozen-lockfile` → exit 0 under Node 24.21.0.
- `pnpm run doctor` → exit 0, Node 24 baseline and Docker client/server/files/lockfile/approved asset PASS.
- `pnpm exec supabase --version` → `2.118.0`; `pnpm exec supabase start --network-id phan-local` → exit 0; foundation migration applied. Docker containers healthy; REST/Studio/Mailpit localhost smoke returned 200.
- `pnpm test:db` → exit 0, local synthetic CORE-01 authorization test PASS; cross-tree restricted read/proposal denial and private raw-table denial verified with authenticated role.
- Standalone HTTP smoke with local Supabase build → `/api/v1/people/not-a-uuid` returned `400` `INVALID_PERSON_ID`; `/api/v1/people/30000000-0000-4000-8000-000000000099` returned `404` `PERSON_NOT_FOUND`; server stopped cleanly after test.
- Standalone HTTP smoke → `POST /api/v1/proposals` and `POST /api/v1/proposals/not-a-uuid/review` with `{}` returned `400` (`INVALID_PROPOSAL`/`INVALID_REVIEW`) and request IDs; server stopped cleanly after test.
- `pnpm audit --audit-level high` → exit 0, “No known vulnerabilities found”.
- `pnpm audit --audit-level moderate` → exit 0, “No known vulnerabilities found”.
- `pnpm verify` → exit 0, foundation-files PASS.
- `pnpm release:check` → exit 2, expected `BLOCKED` because H1–H5 are PENDING; productionDeploy `NOT_RUN`.

2026-09-27 Auth/session evidence: pnpm test:auth exit 0 on local synthetic Supabase; BFF login, proposal submit, author self-review denial, independent approval, persistence/version/audit/outbox verified; temporary users/tree cleaned up. Final pnpm doctor, pnpm test:db, pnpm test, pnpm typecheck, pnpm lint and pnpm verify all exit 0; lint retains one existing PostCSS warning.

2026-09-27 Integrity/projection evidence: migrations 0005-0006 applied to Supabase local; pnpm test:db exit 0 with full private raw-table denial list, reviewer/pending-membership denial, tree-scoped target rejection, stale serialization conflict, canonical person update/version 2 and proposal/person audit-outbox checks. pnpm test:auth exit 0 with the same projection verified through the BFF. True concurrent race, idempotency, broader proposal item kinds and remote CI remain NOT_RUN.

2026-09-27 Idempotency evidence: migration 0007 and API Idempotency-Key boundary applied/tested on local; pnpm test:db and pnpm test:auth exit 0. Missing key returns 428, same key/body replays, same key/different body returns 409, review replay returns stored result without reapplying projection. True concurrent race, broader proposal item kinds and remote CI remain NOT_RUN.

2026-09-27 Final CORE-02 verification: pnpm test, pnpm typecheck, pnpm lint and pnpm build exit 0; lint retains one existing PostCSS warning. Build generated the expected App Router routes and standalone artifact. No cloud/production deployment or real data used.
2026-09-27 Relationship evidence: migration 0008 applied to Supabase local; typed contract test 3/3, pnpm test:db and local authenticated pnpm test:auth exit 0. Parent-link approval persisted canonical relationship with audit/outbox; reverse confirmed biological edge returned HTTP 409 and did not persist. Remaining target kinds, true concurrent race and remote CI remain NOT_RUN.
2026-09-27 Concurrency/retry evidence: pnpm test:concurrency exit 0 with two simultaneous PostgreSQL review transactions: exactly one winner, one P0009 stale conflict and one canonical projection. Business P0008/P0009 conflicts no longer use transient SQLSTATE 40001; pnpm test:db, local pnpm test:auth and local build exit 0. Full RLS matrix and remote CI remain NOT_RUN.

Mỗi test record: testId, requirementId, env, commit, command, startedAt, exitCode, actualResult, status, log/screenshot path, reviewer. Log không chứa PII/secret. Static preview QA là nhóm riêng trong PACKAGE_VALIDATION.
