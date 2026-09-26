# 29. Runbook xử lý lỗi và sự cố

## RB-01 — Đăng nhập/phiên lỗi

Kiểm tra auth provider status, URL/callback/HTTPS, cookie refresh, clock và membership. Không tắt xác minh email/MFA/RLS để người dùng vào tạm. Với user revoked, deny là đúng; với stale session, yêu cầu đăng nhập lại sau khi giữ UX an toàn. Redact token khỏi log.

## RB-02 — Tìm kiếm/cây trống hoặc chậm

Phân biệt thật sự không có dữ liệu, filter, quyền và lỗi query. Kiểm tra tree_id, active grants, projection, pagination và index plan. Không chuyển sang trả toàn bộ graph để “sửa nhanh”. Nếu layout lỗi, bật family-list fallback; giữ cùng policy dữ liệu. Invalid ancestry chặn publish, tạo quality issue.

## RB-03 — Worker/email kẹt

Kiểm tra heartbeat, queue oldest age, DB connection, provider quota và dead letter. Dừng dispatcher nếu đang gửi trùng. Reconcile provider message ID/idempotency trước retry; không resend tất cả sent rows. Pending notification phải re-authorize recipient/resource. Khóa gửi thật ở staging.

## RB-04 — Media lỗi hoặc nghi độc hại

Giữ quarantine; kiểm tra MIME/scan logs không PII, resource limits, checksum và storage policy. Scan unavailable không được đánh ready. Private file leak: revoke đường cấp mới, gỡ publication, purge cache, xem TTL link cũ và logs; không hứa thu hồi file đã tải.

## RB-05 — Import/merge sai

Dừng batch tại checkpoint, không kill rồi xóa manifest. Xác định committed rows, source hash, dependencies và edits sau apply. Tạo compensating plan/restore sandbox; không delete mọi person mới nếu đã có tham chiếu thật. Reconcile roots/edges/citations/user claims/finances và kiểm tra privacy trước mở lại.

## RB-06 — Sai lịch giỗ

Dừng reminder của rule liên quan. So ngày nguồn, calendar, leap flag, policy, timezone và algorithmVersion; kiểm tra golden tests. Sửa policy có review, regenerate future occurrences, reconcile notifications đã gửi. Cập nhật sự kiện giữ UID/version, không tạo hai lịch trùng.

## RB-07 — Sai sổ quỹ

Đóng post kỳ/quỹ liên quan, giữ posted entries và chứng từ. Đối chiếu balanced ledger, duplicate idempotency, award mapping, permissions. Sửa bằng reversal/adjustment đã duyệt hai người; không update amount trực tiếp. Nếu có nghi can thiệp trái phép, thu hồi quyền/tokens liên quan và giữ audit.

## RB-08 — DB hoặc deployment thất bại

Chọn maintenance/read-only nếu cần; ghi exact release/migration/error. Nếu schema backward-compatible, roll back app image; nếu không, forward-fix hoặc restore theo approval. Không chạy down migration tự động. Sau rollback smoke quyền, data, jobs, email và recheck backup; báo dữ liệu có nguy cơ mất rõ ràng.

## RB-09 — Leak secret hoặc dữ liệu

Ngăn truy cập/publish/export liên quan, giữ bằng chứng, rotate/revoke secret, kiểm tra lịch sử commit/artifacts/logs và audit phạm vi. Báo owner/phụ trách dữ liệu; rà soát nghĩa vụ hiện hành. Không chỉ xóa secret khỏi file mới nhất. Không tự công khai chi tiết PII trong thông báo sự cố.

## RB-10 — Chi phí vượt dự kiến

Xem compute/DB/egress/objects/email/jobs. Tạm dừng export lớn/upload vượt quota/loop retry, không xóa nguồn hoặc backup đột ngột. Mọi thay đổi plan/region cần H2 bổ sung. Budget alert không bảo đảm bill dừng; đánh giá provider cap và tính sẵn sàng trước bật.

## Mẫu incident record

Incident ID; mức độ; bắt đầu/phát hiện; dữ liệu/hệ thống ảnh hưởng; bằng chứng redacted; hành động đã làm; người quyết định; trạng thái containment/recovery; RPO/RTO thực; việc cần pháp lý; bài học và test hồi quy mới. Không kết luận root cause khi chưa có bằng chứng.
