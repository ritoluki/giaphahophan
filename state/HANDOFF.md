# Bàn giao cho agent kế tiếp

## Đọc trước
AGENTS.md → START_HERE.md → PROGRESS.md → TASKS.json → BLOCKERS.md/HUMAN_ACTIONS.md → TEST_REPORT.md.

## Hiện trạng sau P0 foundation
Đã scaffold app: `apps/web`, `apps/worker`, `packages/config`, `packages/contracts`, `packages/domain`, `packages/ui`, `packages/lunar`; lockfile và assets đã có; migration `supabase/migrations/0001_foundation.sql`; CI/script foundation. Không có credential/cloud/production endpoint của người dùng. Chưa approval H1–H5.

Evidence local: typecheck PASS, unit/domain test PASS, lint PASS với warnings, Next build PASS, audit high/moderate PASS. Doctor BLOCKED Node 24/Docker daemon; DB/RLS/browser/real-mobile/staging/production NOT_RUN.

## Việc tiếp theo
Đóng ENV-01/ENV-02 khi môi trường cho phép; chạy `pnpm exec supabase --help`, init/start local stack theo docs 16; áp dụng migration local và viết DB/RLS tests. Sau P0-04/P0-05 bắt đầu P1 design system/shared components và screenshot evidence. Không chạy `database/schema.blueprint.sql` thẳng lên production.

## Mẫu cập nhật cuối phiên
- Commit/branch và file đang sửa; chưa commit gì.
- Task đã hoàn tất và evidence.
- Command còn chạy, PID chỉ của project và cách stop an toàn.
- Test FAIL/NOT_RUN; blocker môi trường.
- Approvals đã có, đúng version/hash; yêu cầu còn thiếu.
- Ticket tiếp theo và lý do chọn; thông tin không được làm mất.
