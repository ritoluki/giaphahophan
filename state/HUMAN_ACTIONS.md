# Các bước chủ dự án thực sự cần tham gia

2026-10-06 — APPROVAL RECORDED: project owner approved “local M16 worker migration” in this conversation. Scope is local Supabase only: migration 0075, service_role-only per-operation worker RPCs, live session/AAL + current membership/capability/policy rechecks, outbox, private bucket/manifest, and synthetic local regression/E2E. Risk remains service_role bypassing RLS if a function is defective. Excludes hosted/cloud migration, real genealogy data, public access, paid services, production deployment and H1–H5 approval. Approval evidence: owner message in this thread; no secret values shared. Local migration has been applied; see `state/BLOCKERS.md` and `reports/M16_PERMISSION_EXPORTS.md` for actual test evidence.

[SUPERSEDED 2026-10-06] A local-only `apps/worker/.env.local` was requested for testing. Supabase CLI can provide its locally generated keys/DB URL transiently during elevated local test runs; no owner-created env or cloud secret is required for one-shot tests. A worker env file is optional if the owner wants to run the worker manually.

2026-10-06: no owner action/env needed for M16-05 local continuation. Docker access works with authorized execution outside sandbox; earlier Docker restoration request is superseded. Chunk SQL and authenticated mobile flows PASS. Continue concurrent cancel/apply/replay checks and build separate two-person compensation review/apply. No H4/H5 approval inferred.

2026-10-04: no owner action/env needed for local M16-04 continuation. Scalar apply and reversible row decisions verified with synthetic Docker fixtures; agent continues full-row inspection/relationship mapping. H2/H4/H5 remain separate gates; no real data or production deployment authorized by these tests.

Approval above is narrowly scoped to local M16 worker engineering only. No H1–H5 product, data-governance, staging or production gate is approved by it; do not broaden the decision.

## Môi trường hiện tại (không phải approval sản phẩm)

- 2026-10-06: Node 24.21.0 and local Docker/Supabase are available to the agent for approved local synthetic tests. No owner env or secret is needed for one-shot local work; do not paste secrets into chat. (Older setup requests in this file are superseded.)

## H1 — Giao diện
Duyệt bản home, hồ sơ, gia phả mobile, lịch, quản trị. Xem chữ/màu/bố cục trên điện thoại thật. Ghi link/build/screenshot version và điều chỉnh đã chốt.

## H2 — Tài khoản và chi phí
Chủ dự án tạo/đứng tên repository, cloud, domain, email và bật MFA. Duyệt vùng lưu trữ, budget/quota, người giữ recovery/backup keys. Nhập secret qua secret manager, không dán chat. Agent phải đưa từng URL/chỉ dẫn đúng provider đã chọn khi đến bước này.

2026-10-03: Không cần hành động owner cho M16-04 local demo continuation. Không cần thêm env/secret để làm relationship mapping hoặc M16-05 local. Các gate H2–H5 dưới đây chỉ cần xử lý khi công việc thực sự tới phạm vi tương ứng; không đánh dấu approved từ test synthetic.

## H3 — Quản trị dữ liệu
Chỉ định ít nhất người nhập và người duyệt độc lập; chốt người được xem dữ liệu sống/trẻ em, publication consent, lịch giỗ tháng nhuận, tài liệu có thể xử lý ở đâu. Hỏi chỉ những điểm tư liệu chưa có câu trả lời.

2026-10-06 — Cần chốt trước khi triển khai M16-06 `includeMedia`: xác nhận có áp dụng quy tắc “chỉ đóng gói asset sau khi người duyệt độc lập đã liệt kê/kiểm tra mọi người xuất hiện và có consent hợp lệ cho đúng audience/scope” hay không; nếu có, ai/role nào được làm reviewer và asset chưa rõ/thiếu consent phải bị loại kèm cảnh báo hay làm cả export thất bại. Khuyến nghị an toàn: loại asset không đủ bằng chứng, lưu quyết định duyệt theo version; không xem liên kết `asset → person` là bằng chứng người đó là người duy nhất trong ảnh. Căn cứ `docs/13_MEDIA_CONTENT_PLACES.md`, `docs/10_AUTH_PERMISSIONS_PRIVACY.md`; hiện media export vẫn fail-closed. Không hỏi lại các phần H3 không liên quan cho tới khi chạm phạm vi.

## H4 — Production
Duyệt exact release manifest, launch mode demo/real, tên miền và rollback. Không duyệt chung chung “cứ deploy” cho mọi release tương lai.

## H5 — Dữ liệu thật
Duyệt batch có hash, nguồn, danh sách ghi mới/sửa/không chắc, publication scope, backup và kế hoạch phục hồi. Duyệt từng batch hoặc chính sách batch rõ ràng, không dựa vào tên file giống nhau.

Mẫu bằng chứng: ID; thời gian; người duyệt; phạm vi; hash/version; quyết định; hạn chế; evidence. H4/H5 không thay thế consent/authority cần thiết của chủ thể dữ liệu.
2026-10-06 current: no owner repair/env needed for local work; compensation and concurrency checks PASS. Pending non-blocking decision before future cloud staging: is the existing Supabase project staging with demo data, or reserved for production? Local work continues while awaiting this answer. No cloud migration, real-data use, paid service or production deployment authorized by local tests.
