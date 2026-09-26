# Báo cáo kiểm thử ứng dụng

Application status: FOUNDATION_AND_P1_DEMO_EXECUTED; product acceptance remains NOT_RUN. Không dùng PACKAGE_VALIDATION.json để đổi trạng thái ứng dụng.

| Nhóm | Trạng thái | Evidence |
|---|---|---|
| Lint ứng dụng | PASS | `pnpm lint`, local Windows Node 22.13.0, exit 0; 1 warning PostCSS không error |
| Typecheck ứng dụng/packages | PASS | `pnpm typecheck`, local Windows Node 22.13.0, exit 0 |
| Build foundation + P1 demo | PASS | `pnpm build`, Next 16.3.3, exit 0; 14 app routes + health live/ready trong log |
| Unit/domain/property | PASS (foundation only) | `pnpm test`, Vitest 4.1.11, 5 domain tests pass; empty suites explicitly passWithNoTests |
| Local HTTP smoke | PASS (P1 demo only) | Standalone artifact `apps/web/.next/standalone/apps/web/server.js`; `/`, `/tra-cuu?q=Phan`, `/gia-pha`, `/nguoi/0e6ee4e5-9816-52b8-bc8b-33d7c79efe9c`, `/lich-ho`, `/tu-lieu`, `/api/v1/health/live` đều 200; `/api/v1/health/ready` vẫn 503 degraded khi DB chưa cấu hình |
| DB/RLS/authorization/concurrency | NOT_RUN | — |
| API contract/integration | NOT_RUN | — |
| E2E local/staging | PASS (local demo only) | `pnpm test:e2e`, production build + standalone server, 10/10 tests PASS across desktop Chromium and Pixel 5 mobile; admin preview included |
| Lunar golden + roundtrip | NOT_RUN | — |
| Accessibility/real mobile | NOT_RUN | Semantic locator smoke included in E2E; full axe/manual/real-device audit not run |
| Performance/load | NOT_RUN | — |
| Security review | NOT_RUN | — |
| DB + object restore drill | NOT_RUN | — |
| Visual screenshot evidence | PASS (local demo only) | `reports/design-review/`: 12 screenshots for home/person/family-focus/calendar/sources/admin on desktop Chromium and Pixel 5 mobile; H1 reviewer approval PENDING |
| Production smoke/rollback | NOT_RUN | No production endpoint/approval; deploy intentionally not attempted |

## Test command records

- `pnpm run doctor` → exit 2, `BLOCKED`: Node 24 missing, Docker daemon unavailable; client/files/lockfile detected.
- `pnpm audit --audit-level high` → exit 0, “No known vulnerabilities found”.
- `pnpm audit --audit-level moderate` → exit 0, “No known vulnerabilities found”.
- `pnpm verify` → exit 0, foundation-files PASS.
- `pnpm release:check` → exit 2, expected `BLOCKED` because H1–H5 are PENDING; productionDeploy `NOT_RUN`.

Mỗi test record: testId, requirementId, env, commit, command, startedAt, exitCode, actualResult, status, log/screenshot path, reviewer. Log không chứa PII/secret. Static preview QA là nhóm riêng trong PACKAGE_VALIDATION.
