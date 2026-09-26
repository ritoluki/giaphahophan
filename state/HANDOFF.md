# Bàn giao cho agent kế tiếp

## Đọc trước
AGENTS.md → START_HERE.md → PROGRESS.md → TASKS.json → BLOCKERS.md/HUMAN_ACTIONS.md → TEST_REPORT.md.

## Hiện trạng sau P0 foundation và P1 vertical slice
Đã scaffold app: `apps/web`, `apps/worker`, `packages/config`, `packages/contracts`, `packages/domain`, `packages/ui`, `packages/lunar`; lockfile và assets đã có; migrations `supabase/migrations/0001_foundation.sql`–`0004_fix_review_rpc.sql`; CI/script foundation. P1 có shared chrome, search, family focus, profile và fixture-driven routes. CORE-01 có allowlisted projection/proposal RPC và synthetic DB tests. `.env.local` được Next nhận diện nhưng chỉ dùng demo/public config. Không có dữ liệu thật. Chưa approval H1–H5.

Evidence local: typecheck PASS, unit/domain+contract test PASS (7 tests), lint PASS với 1 warning, Next build PASS 14 routes, standalone HTTP smoke P1 PASS, Playwright responsive/a11y smoke PASS 18/18 at desktop 1440px, Pixel 5 and 320px, 18 screenshot evidence including admin preview; audit high/moderate PASS. Docker/Supabase local PASS: CLI 2.118.0, migrations 0001–0004 applied, local REST/Studio/Mailpit smoke 200, `pnpm test:db` PASS for CORE-01 synthetic authorization. Doctor còn BLOCKED Node 24 baseline; cross-tree/concurrency/full RLS/WebKit/real-mobile/full-a11y/staging/production NOT_RUN.

## Việc tiếp theo
ENV-02 đã đóng. CORE-01 đang tiếp tục với API server wiring, cross-tree/concurrency/RLS matrix; sau đó CORE-02 sẽ nối vertical slice DB proposal→review→projection. ENV-01 chỉ còn Node 24 release baseline. Hoàn thiện P1 bằng full a11y/WebKit nếu cần và H1 review. Không chạy `database/schema.blueprint.sql` thẳng lên production.

## Mẫu cập nhật cuối phiên
- Commit/branch và file đang sửa; chưa commit gì.
- Task đã hoàn tất và evidence.
- Command còn chạy, PID chỉ của project và cách stop an toàn.
- Test FAIL/NOT_RUN; blocker môi trường.
- Approvals đã có, đúng version/hash; yêu cầu còn thiếu.
- Ticket tiếp theo và lý do chọn; thông tin không được làm mất.
