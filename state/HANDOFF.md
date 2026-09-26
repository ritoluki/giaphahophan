# Bàn giao cho agent kế tiếp

## Đọc trước
AGENTS.md → START_HERE.md → PROGRESS.md → TASKS.json → BLOCKERS.md/HUMAN_ACTIONS.md → TEST_REPORT.md.

## Hiện trạng sau P0 foundation và P1 vertical slice
Đã scaffold app: `apps/web`, `apps/worker`, `packages/config`, `packages/contracts`, `packages/domain`, `packages/ui`, `packages/lunar`; lockfile và assets đã có; migration `supabase/migrations/0001_foundation.sql`; CI/script foundation. P1 có shared chrome, search, family focus, profile và fixture-driven routes. `.env.local` được Next nhận diện nhưng chỉ dùng demo/public config. Không có dữ liệu thật. Chưa approval H1–H5.

Evidence local: typecheck PASS, unit/domain test PASS, lint PASS với 1 warning, Next build PASS 14 routes, standalone HTTP smoke P1 PASS, Playwright Chromium desktop/mobile E2E PASS 10/10, 12 screenshot evidence including admin preview; audit high/moderate PASS. Doctor BLOCKED Node 24/Docker daemon; DB/RLS/WebKit/real-mobile/full-a11y/staging/production NOT_RUN.

## Việc tiếp theo
Đóng ENV-01/ENV-02 khi môi trường cho phép; chạy `pnpm exec supabase --help`, init/start local stack theo docs 16; áp dụng migration local và viết DB/RLS tests. Hoàn thiện P1 bằng full a11y/WebKit nếu cần và H1 review. Không chạy `database/schema.blueprint.sql` thẳng lên production.

## Mẫu cập nhật cuối phiên
- Commit/branch và file đang sửa; chưa commit gì.
- Task đã hoàn tất và evidence.
- Command còn chạy, PID chỉ của project và cách stop an toàn.
- Test FAIL/NOT_RUN; blocker môi trường.
- Approvals đã có, đúng version/hash; yêu cầu còn thiếu.
- Ticket tiếp theo và lý do chọn; thông tin không được làm mất.
