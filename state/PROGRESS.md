# Tiến độ

Ngày khởi tạo bộ hồ sơ: 26/09/2026.

## Hiện trạng
P0 đang triển khai song song với P1. Đã tạo pnpm workspace, Next.js App Router scaffold, worker skeleton, packages config/contracts/domain/ui/lunar, approved assets, foundation migration fail-closed, CI template và scripts kiểm tra. P1 đã có vertical slice demo mobile-first cho home/search/tree/person/calendar/sources; chưa tuyên bố hoàn thành M01–M18, chưa có auth/DB runtime, chưa có dữ liệu thật và chưa deploy.

P0-02/P0-03: DONE theo evidence local. P0-01: BLOCKED do local Node 22.13.0 và Docker daemon chưa xác minh. P0-04/P0-05: IN_PROGRESS; migration/CI chưa chạy trên DB/browser thật.

## Execution plan đã chốt

1. P0: môi trường, exact dependency/lockfile, scaffold/scripts, contract/runtime schemas, migration foundation, CI harness.
2. P1: design tokens/components dùng asset đã duyệt; home/search/person/calendar/admin responsive; tạo evidence H1 nhưng không tự approve.
3. P2: Supabase local/Auth/RPC/RLS + vertical slice đề nghị→review→projection; chỉ chạy sau Docker daemon.
4. P3–P7: domain modules theo DAG trong `state/TASKS.json`, mỗi module có happy/empty/error/denied/loading/mobile và test thực.
5. P8–P11: hardening, staging/restore, H2/H3/H4/H5 gates; production chỉ sau approval exact manifest.

## Chặng tiếp theo
Hoàn thiện P0-04/P0-05 bằng Supabase local + RLS/DB tests khi Docker daemon hoạt động; song song hoàn thiện P1 bằng Playwright screenshots/a11y và H1 review, sau đó mới chuyển P2 Auth/RPC/RLS. Không cần dữ liệu thật để tiếp tục.

## Nhật ký triển khai
2026-09-26 — P0-01..P0-05: scaffold và foundation code; `pnpm-lock.yaml`; audit sau pin bảo mật; `pnpm typecheck` PASS, `pnpm test` PASS (5 domain tests), `pnpm lint` PASS với 15 warning, `pnpm build` PASS Next 16.3.3, local HTTP smoke PASS (`/` 200, live 200, ready 503 degraded), `pnpm verify` PASS; `pnpm run doctor` BLOCKED Node 24/Docker daemon; DB/browser/E2E NOT_RUN. Đã khởi tạo Git, commit `eab975447bd4b5f73daf4685590fac633e4166da` và push thành công lên `origin/main`; repo không chứa env/secret thật.
2026-09-26 — P1 vertical slice: shared chrome/search/family-focus components; approved logo/hero assets; fixture-driven home, search, family focus, person profile, calendar and sources routes. `pnpm typecheck` PASS, `pnpm lint` PASS với 1 warning PostCSS, `pnpm build` PASS Next 16.3.3 (14 routes), `pnpm test` PASS (5 domain tests), `pnpm verify` PASS; standalone smoke PASS (`/`, `/tra-cuu?q=Phan`, `/gia-pha`, `/nguoi/[id]`, `/lich-ho`, `/tu-lieu`, `/api/v1/health/live` đều 200). Playwright E2E PASS 8/8 trên desktop Chromium + Pixel 5 mobile; 10 screenshot evidence đã tạo; full a11y/WebKit/real-device/H1 approval vẫn NOT_RUN/PENDING.

Agent bổ sung theo mẫu: ngày, task, commit, thay đổi, command thực chạy, kết quả, evidence path, việc tiếp theo. Không ghi token/password hoặc dữ liệu thật.
