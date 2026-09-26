# Báo cáo kiểm thử ứng dụng

Application status: FOUNDATION_EXECUTED; product acceptance remains NOT_RUN. Không dùng PACKAGE_VALIDATION.json để đổi trạng thái ứng dụng.

| Nhóm | Trạng thái | Evidence |
|---|---|---|
| Lint ứng dụng | PASS | `pnpm lint`, local Windows Node 22.13.0, exit 0; 15 warnings không error |
| Typecheck ứng dụng/packages | PASS | `pnpm typecheck`, local Windows Node 22.13.0, exit 0 |
| Build foundation | PASS | `pnpm build`, Next 16.3.3, exit 0; 12 app routes + health live/ready trong log |
| Unit/domain/property | PASS (foundation only) | `pnpm test`, Vitest 4.1.11, 5 domain tests pass; empty suites explicitly passWithNoTests |
| Local HTTP smoke | PASS (foundation only) | Standalone artifact `apps/web/.next/standalone/apps/web/server.js`; `/` 200 + title; `/api/v1/health/live` 200; `/api/v1/health/ready` 503 degraded đúng khi DB chưa cấu hình |
| DB/RLS/authorization/concurrency | NOT_RUN | — |
| API contract/integration | NOT_RUN | — |
| E2E local/staging | NOT_RUN | — |
| Lunar golden + roundtrip | NOT_RUN | — |
| Accessibility/real mobile | NOT_RUN | — |
| Performance/load | NOT_RUN | — |
| Security review | NOT_RUN | — |
| DB + object restore drill | NOT_RUN | — |
| Production smoke/rollback | NOT_RUN | No production endpoint/approval; deploy intentionally not attempted |

## Test command records

- `pnpm run doctor` → exit 2, `BLOCKED`: Node 24 missing, Docker daemon unavailable; client/files/lockfile detected.
- `pnpm audit --audit-level high` → exit 0, “No known vulnerabilities found”.
- `pnpm audit --audit-level moderate` → exit 0, “No known vulnerabilities found”.
- `pnpm verify` → exit 0, foundation-files PASS.
- `pnpm release:check` → exit 2, expected `BLOCKED` because H1–H5 are PENDING; productionDeploy `NOT_RUN`.

Mỗi test record: testId, requirementId, env, commit, command, startedAt, exitCode, actualResult, status, log/screenshot path, reviewer. Log không chứa PII/secret. Static preview QA là nhóm riêng trong PACKAGE_VALIDATION.
