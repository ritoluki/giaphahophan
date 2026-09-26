# 20. Từ local đến production

## 1. Chuẩn bị tài khoản và quyền H2

Chủ dự án sở hữu Git hosting, domain/DNS, Supabase, Railway, email và backup storage. Agent chỉ được quyền cần thiết trong thời gian cần thiết. Bật MFA chủ sở hữu, lưu recovery ở vault; có người kế nhiệm/quy trình lấy lại quyền. Không để sản phẩm phụ thuộc account cá nhân của agent hoặc nhà phát triển.

H2 ghi: region lưu DB/files/backups, nhà cung cấp, mức chi dự trù/trần phê duyệt, ai được deploy, nơi giữ keys, người nhận alert. Không tạo project trả phí hoặc chọn vùng ngoài Việt Nam trước approval tương ứng.

## 2. Môi trường tách biệt

Development: local Supabase + mailbox local + demo. Staging: project DB/Auth/Storage riêng, web/worker riêng, dữ liệu synthetic, noindex và access protection; mail allowlist tới địa chỉ tester. Production: DB/Auth/Storage riêng; DATA_MODE demo hoặc real theo H4/H5. Không dùng branch preview nối production database.

Tên env rõ ràng, host allowlist, region thống nhất khi có thể; agent kiểm tra network của worker đến Supabase và connection pool. Một instance web/worker là baseline tiết kiệm; không quảng cáo high availability. Scale sau số đo và chi phí được duyệt.

## 3. Build artifact

Multi-stage Docker, Node LTS pin version/digest, không root runtime, build reproducible với lockfile. Next standalone output, static/public assets đúng path; không copy `.env`, test secrets, raw real documents hoặc build cache private vào image. Worker image có dependencies/media binaries cần thiết; Chromium PDF có sandbox/capabilities phù hợp, không gắn docker socket vào container.

Build một commit ra immutable image digest; promote đúng digest staging→production, không rebuild khác code rồi gọi cùng release. Public env dùng lúc build được record; secret runtime không bake vào image. Healthcheck và graceful shutdown web/worker; worker drain công việc đang chạy, checkpoint/retry an toàn.

## 4. CI pipeline

PR: secret scan → lint → typecheck → unit/property → build → DB ephemeral migration/RLS → integration/E2E → a11y/visual → dependency/license/SBOM. Không cấp prod secret cho PR từ fork; không dùng pull_request_target để chạy code không tin cậy có secrets. Actions và images pin commit/digest sau khi kiểm tra nguồn, không chép SHA giả.

Main: tất cả check pass → build/push artifact → staging migration → deploy worker/web compatible → staging smoke. Protected production environment yêu cầu approval theo H4; không auto publish lần đầu. Release evidence đính commit, contract version, migration range, image digest, approvals và rollback.

## 5. Database migrations

Migrations append-only sau merge. Expand→backfill→switch reads/writes→contract ở release sau. Không drop column cùng release client cũ còn chạy. Preview migration trên clone synthetic; kiểm tra lock duration, row counts, indexes, grants/RLS/functions. SQL role/password/secret không trong migration.

Trước production migration: backup verified, release lock, đúng project ID/host, H4 cho phép. Migrate bằng deploy role, không web runtime. DDL pg-boss schema do bước migration kiểm soát, runtime không auto-upgrade. Migration fail thì dừng deploy, không chạy lại câu lệnh phá dữ liệu nhiều lần.

Rollback mặc định là app version cũ tương thích schema mở rộng; không chạy down migration phá dữ liệu để quay lại. Nếu schema không backward-compatible, chuẩn bị forward-fix/restore plan và maintenance window được duyệt.

## 6. Domain, HTTPS, email

Tạo hostname production và staging được owner xác nhận; app canonical URL, auth redirect allowlist và callback cùng domain. Validate TLS trước HSTS. DNS thay đổi phải có bản ghi trước/sau và rollback; không xóa MX/email existing của owner.

Email provider xác minh domain với SPF/DKIM/DMARC theo tài liệu nhà cung cấp, kiểm tra không tạo nhiều SPF record xung đột. Supabase Auth SMTP riêng và email nghiệp vụ separate templates/rate quota. Thử đăng ký/lời mời, reset password, bounce/suppression và unsubscribe/preferences bằng tester được phép. Không gửi hàng loạt cho danh sách họ hàng chưa consent.

## 7. Cấu hình production tối thiểu

APP_ENV=production; DATA_MODE rõ; auth redirect/domain allowlist; upload quota; private buckets; no mock providers; MFA privileged; CSP/security headers; policy current; email sender verified; outbox/worker heartbeat; backup destination encryption; monitor alert receivers; budget alerts; map/AI flags off trừ approval riêng.

Không đưa Sentry replay/PII capture hoặc third-party analytics vào mặc định. Feature flags có owner, default và server-side guard; không coi một biến NEXT_PUBLIC ẩn nút là khóa bảo mật.

## 8. Preflight và go-live H4

Hoàn thành docs 23. Chạy smoke trên URL thật với visitor, member, reviewer và finance roles. Kiểm tra search/graph mobile, source/private asset, expiry/logout, calendar preview, đề nghị/duyệt, import idempotency, export, ledger, health, notification thử và backup timestamp. Kiểm tra browser console/network không secret/leak.

H4 approve exact release manifest, kiểu launch demo hay real và risk exceptions. Người phụ trách bấm/ủy quyền deployment đã chuẩn bị, agent không tự giả chữ ký. DNS rollout sau staging pass; sau release theo dõi errors/auth/queue/DB/objects bằng runbook. Demo launch bắt buộc banner/noindex; real launch cần thêm H5.

## 9. Khi chưa có tài khoản hoặc quyền

Agent vẫn hoàn thành images, CI template, env schema, migration, tests local, runbook và danh sách giá trị cần nhập. Trạng thái triển khai remote là NOT_RUN/BLOCKED, không giả URL live. Không viết “đã lên production” chỉ vì Docker build pass.
