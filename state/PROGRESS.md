# Tiến độ

Ngày khởi tạo bộ hồ sơ: 26/09/2026.

## Hiện trạng
P0 đang triển khai song song với P1. Đã tạo pnpm workspace, Next.js App Router scaffold, worker skeleton, packages config/contracts/domain/ui/lunar, approved assets, foundation migration fail-closed, CI template và scripts kiểm tra. P1 đã có vertical slice demo mobile-first cho home/search/tree/person/calendar/sources; chưa tuyên bố hoàn thành M01–M18, chưa có auth/DB runtime, chưa có dữ liệu thật và chưa deploy.

P0-01/P0-02/P0-03: DONE theo evidence local dưới Node 24. P0-04/P0-05: IN_PROGRESS; foundation migration đã chạy trên Supabase local, còn RLS/integration/CI remote chưa đóng.

## Execution plan đã chốt

1. P0: môi trường, exact dependency/lockfile, scaffold/scripts, contract/runtime schemas, migration foundation, CI harness.
2. P1: design tokens/components dùng asset đã duyệt; home/search/person/calendar/admin responsive; tạo evidence H1 nhưng không tự approve.
3. P2: Supabase local/Auth/RPC/RLS + vertical slice đề nghị→review→projection; chỉ chạy sau Docker daemon.
4. P3–P7: domain modules theo DAG trong `state/TASKS.json`, mỗi module có happy/empty/error/denied/loading/mobile và test thực.
5. P8–P11: hardening, staging/restore, H2/H3/H4/H5 gates; production chỉ sau approval exact manifest.

## Chặng tiếp theo
Hoàn thiện P0-04/P0-05 bằng RLS/DB tests trên Supabase local; chuyển sang P2 Auth/RPC/permission foundation bằng demo data synthetic. Node 24 vẫn là release baseline cần owner/environment action; không cần dữ liệu thật để tiếp tục.

## Nhật ký triển khai
2026-09-26 — P0-01..P0-05: scaffold và foundation code; `pnpm-lock.yaml`; audit sau pin bảo mật; `pnpm typecheck` PASS, `pnpm test` PASS (5 domain tests), `pnpm lint` PASS với 15 warning, `pnpm build` PASS Next 16.3.3, local HTTP smoke PASS (`/` 200, live 200, ready 503 degraded), `pnpm verify` PASS; `pnpm run doctor` BLOCKED Node 24/Docker daemon; DB/browser/E2E NOT_RUN. Đã khởi tạo Git, commit `eab975447bd4b5f73daf4685590fac633e4166da` và push thành công lên `origin/main`; repo không chứa env/secret thật.
2026-09-26 — P1 vertical slice: shared chrome/search/family-focus components; approved logo/hero assets; fixture-driven home, search, family focus, person profile, calendar and sources routes. `pnpm typecheck` PASS, `pnpm lint` PASS với 1 warning PostCSS, `pnpm build` PASS Next 16.3.3 (14 routes), `pnpm test` PASS (5 domain tests), `pnpm verify` PASS; standalone smoke PASS (`/`, `/tra-cuu?q=Phan`, `/gia-pha`, `/nguoi/[id]`, `/lich-ho`, `/tu-lieu`, `/api/v1/health/live` đều 200). Playwright E2E PASS 8/8 trên desktop Chromium + Pixel 5 mobile; 10 screenshot evidence đã tạo; full a11y/WebKit/real-device/H1 approval vẫn NOT_RUN/PENDING.
2026-09-27 — UI-02 admin preview: added separate admin shell, restricted/empty preview cards and capability safety principles. `pnpm typecheck` PASS, `pnpm lint` PASS với 1 warning PostCSS, `pnpm test:e2e` PASS 10/10 trên desktop Chromium + Pixel 5 mobile; 12 screenshot evidence đã tạo. H1 approval, full a11y, WebKit và real-device vẫn PENDING/NOT_RUN.
2026-09-27 — Responsive/a11y smoke: Playwright matrix PASS 18/18 across desktop 1440×1000, Pixel 5 and mobile 320×844; skip-link, main landmark, alt presence and visible touch-target contracts checked; 18 screenshots regenerated. Full axe/manual audit, WebKit, real device and H1 approval remain PENDING/NOT_RUN.
2026-09-27 — P0 local runtime: added pinned Supabase CLI `2.118.0` as workspace devDependency; created localhost-only Docker network `phan-local`; `pnpm exec supabase start --network-id phan-local` PASS and applied `0001_foundation.sql`. Docker client/server `29.8.0` PASS; REST/Studio/Mailpit localhost smoke PASS 200. `pnpm run doctor` now reports only Node 24 baseline BLOCKED; Node 22 local remains usable for development checks.
2026-09-27 — CORE-01 authorization foundation: added migrations `0002_core_authorization.sql` through `0004_fix_review_rpc.sql` for auth.uid-based membership/capability helpers, allowlisted person projection, proposal submit/review, optimistic version, audit/outbox and least-privilege grants. Added Zod contracts/tests and `pnpm test:db` runner. `pnpm test:db` PASS synthetic local DB; anonymous public/protected redaction, member read, capability gate, cross-tree restricted read/proposal denial, author-review denial, independent review, audit/outbox and raw-table denial all exercised. Typecheck/unit/lint/build PASS; lint retains 1 PostCSS warning. CORE-01 remains IN_PROGRESS until authenticated API/session, concurrency and broader RLS matrix are added.
2026-09-27 — CORE-01 server boundary: added `GET /api/v1/people/[id]`, using publishable-key Supabase client only, API RPC `person_get`, Zod output validation, redacted error messages and `Cache-Control: no-store`. Standalone HTTP smoke with local-configured build returned 400 for invalid UUID and 404 PERSON_NOT_FOUND for valid synthetic UUID; typecheck/lint/build PASS. Authenticated session and cross-tree matrix remain NOT_RUN.
2026-09-27 — CORE-02 API boundary: added `POST /api/v1/proposals` and `POST /api/v1/proposals/[id]/review` using Supabase SSR cookie sessions, Zod request/output schemas and allowlisted RPCs with redacted status mapping. Standalone smoke PASS: invalid submit/review payloads returned 400 with request IDs. Authenticated session, projection apply and concurrency remain NOT_RUN.
2026-09-27 — Environment gate: switched to Node `v24.21.0`, restored global `pnpm@12.6.0`, `pnpm install --frozen-lockfile` PASS. `pnpm run doctor` PASS; typecheck, unit/contract, test:db, lint and build PASS under Node 24. ENV-01 resolved.

Agent bổ sung theo mẫu: ngày, task, commit, thay đổi, command thực chạy, kết quả, evidence path, việc tiếp theo. Không ghi token/password hoặc dữ liệu thật.
