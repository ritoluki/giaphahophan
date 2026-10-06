# Các bước chủ dự án thực sự cần tham gia

2026-10-06 — needed for M16-06 live worker integration only: create ignored `apps/worker/.env.local` with the existing `packages/config` server schema keys: `APP_ENV=development`, `DATA_MODE=demo`, `NEXT_PUBLIC_APP_URL=http://localhost:3100`, local `NEXT_PUBLIC_SUPABASE_URL`, local `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, local-only `SUPABASE_SERVICE_ROLE_KEY`, local-only `SUPABASE_DB_URL`, and a random local `CSRF_SECRET` (at least 16 chars). Do not use cloud/prod service key and do not paste any values into chat. The local Supabase CLI could not be inspected in sandbox because it tries writing telemetry under the user profile; app web env currently contains only five public/runtime keys and the worker env file is absent. Meanwhile agent continues work not requiring credentials.

2026-10-06: no owner action/env needed for M16-05 local continuation. Docker access works with authorized execution outside sandbox; earlier Docker restoration request is superseded. Chunk SQL and authenticated mobile flows PASS. Continue concurrent cancel/apply/replay checks and build separate two-person compensation review/apply. No H4/H5 approval inferred.

2026-10-04: no owner action/env needed for local M16-04 continuation. Scalar apply and reversible row decisions verified with synthetic Docker fixtures; agent continues full-row inspection/relationship mapping. H2/H4/H5 remain separate gates; no real data or production deployment authorized by these tests.

Chưa có hành động nào được đánh dấu đã duyệt. Agent không được tự ghi APPROVED.

## Môi trường hiện tại (không phải approval sản phẩm)

- Mở/khởi động Docker Desktop, rồi chạy lại `DOCKER_CONFIG=.docker-config docker version`; không cần gửi secret.
- Cung cấp Node 24 LTS trong PATH/terminal mới để đóng environment gate. Trong lúc chờ, agent tiếp tục các phần không phụ thuộc DB.

## H1 — Giao diện
Duyệt bản home, hồ sơ, gia phả mobile, lịch, quản trị. Xem chữ/màu/bố cục trên điện thoại thật. Ghi link/build/screenshot version và điều chỉnh đã chốt.

## H2 — Tài khoản và chi phí
Chủ dự án tạo/đứng tên repository, cloud, domain, email và bật MFA. Duyệt vùng lưu trữ, budget/quota, người giữ recovery/backup keys. Nhập secret qua secret manager, không dán chat. Agent phải đưa từng URL/chỉ dẫn đúng provider đã chọn khi đến bước này.

2026-10-03: Không cần hành động owner cho M16-04 local demo continuation. Không cần thêm env/secret để làm relationship mapping hoặc M16-05 local. Các gate H2–H5 dưới đây chỉ cần xử lý khi công việc thực sự tới phạm vi tương ứng; không đánh dấu approved từ test synthetic.

## H3 — Quản trị dữ liệu
Chỉ định ít nhất người nhập và người duyệt độc lập; chốt người được xem dữ liệu sống/trẻ em, publication consent, lịch giỗ tháng nhuận, tài liệu có thể xử lý ở đâu. Hỏi chỉ những điểm tư liệu chưa có câu trả lời.

## H4 — Production
Duyệt exact release manifest, launch mode demo/real, tên miền và rollback. Không duyệt chung chung “cứ deploy” cho mọi release tương lai.

## H5 — Dữ liệu thật
Duyệt batch có hash, nguồn, danh sách ghi mới/sửa/không chắc, publication scope, backup và kế hoạch phục hồi. Duyệt từng batch hoặc chính sách batch rõ ràng, không dựa vào tên file giống nhau.

Mẫu bằng chứng: ID; thời gian; người duyệt; phạm vi; hash/version; quyết định; hạn chế; evidence. H4/H5 không thay thế consent/authority cần thiết của chủ thể dữ liệu.
2026-10-06 current: no owner repair/env needed for local work; compensation and concurrency checks PASS. Pending non-blocking decision before future cloud staging: is the existing Supabase project staging with demo data, or reserved for production? Local work continues while awaiting this answer. No cloud migration, real-data use, paid service or production deployment authorized by local tests.
