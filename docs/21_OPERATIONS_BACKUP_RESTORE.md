# 21. Vận hành, sao lưu và phục hồi

## Mục tiêu vận hành

Baseline dự án: RPO ≤24 giờ và RTO ≤8 giờ trên dữ liệu tham chiếu; đây là mục tiêu cần diễn tập, không phải SLA nhà cung cấp hoặc kết quả đã đạt. Owner phải duyệt mức mất dữ liệu tối đa có thể chấp nhận, đặc biệt với sổ quỹ. Nếu cần RPO thấp hơn, đánh giá PITR/backup tăng tần suất và chi phí trước khi bật.

Supabase có backup DB theo gói, nhưng **database backup không gồm nội dung object Storage**. Phục hồi metadata mà thiếu ảnh/PDF không được coi là khôi phục gia phả đầy đủ. [S09]

## Lịch chuẩn được triển khai trong ứng dụng/hạ tầng

Daily: backup DB và objects manifest encrypted off-site; kiểm tra hoàn tất/checksum/age. Weekly: kiểm tra orphan files, failed jobs, quyền tài khoản đặc quyền, dự trù storage/chi phí. Monthly: restore drill trên môi trường cô lập và review chất lượng dữ liệu. Trước import thật/merge lớn/migration rủi ro: snapshot bổ sung đã verified.

Retention mặc định đề xuất: 7 daily, 4 weekly, 6 monthly; owner/phụ trách dữ liệu xác nhận theo loại dữ liệu/nghĩa vụ. Deletion requests có thể yêu cầu điều chỉnh retention; không xóa chọn lọc backup mã hóa một cách giả tạo rồi khẳng định đã purge hoàn toàn.

## Bộ sao lưu hoàn chỉnh

- Application schema/data, constraints/indexes/functions/grants/policies và migrations/contract version.
- Auth/identity restoration plan đúng cơ chế provider; user mapping stable, cấu hình providers/redirect/SMTP tham chiếu bí mật không chứa secret plaintext.
- Object manifest: bucket/key, SHA-256, size, media ID, version, captured_at; encrypted object bytes ở account/off-site độc lập.
- Content revisions, sources/citations, external ID maps, merge/import manifests, ledger và audit tối thiểu.
- Release manifest, env variable names và key IDs; encryption/backup keys lưu **ngoài** DB backup trong vault do owner giữ.

Không giả định `db dump` mặc định đã chứa auth/storage/custom roles theo cách đủ restore; agent phải kiểm tra hành vi CLI/provider thực tế và chứng minh login/permissions/files sau restore. Custom role passwords có thể không có trong backup, cần recreate/rotate qua secret manager. [S09]

## Snapshot consistency

Original objects immutable theo key/version, cleanup trì hoãn đủ retention. Chụp DB snapshot nhất quán tại T, lấy danh sách objects được snapshot tham chiếu, copy/hash những object này; chỉ mark backup_success khi tất cả khớp. Một upload chưa ready ở T không làm snapshot ready thiếu object. Không coi job exit 0 là đủ nếu manifest không khớp.

Backup destination private; encryption phía client bằng công cụ được duyệt như restic/S3-compatible backend, không tự thiết kế thuật toán mã hóa. R2 là lựa chọn tham chiếu, không phải nơi public lưu bản gia phả. Test egress/quota/time với 20GB giả lập đại diện trước claim RTO. [S25]

## Quy trình phục hồi sandbox

1. Owner/ops xác định recovery point và reason; tạo môi trường cô lập, không gửi email/webhook thật.
2. Verify checksum/decrypt manifest, versions và khóa cần thiết.
3. Khôi phục schema/data theo provider hỗ trợ; recreate roles/secrets riêng; restore object bytes và metadata/mapping nhất quán.
4. Chạy migrations tương thích, không tự nhảy lên newest schema; restore policy/RLS trước mở bất kỳ endpoint nào.
5. Replay erasure/revocation tombstones phát sinh sau snapshot để không hồi sinh dữ liệu đã xóa.
6. Disable/reconcile pending outbox/jobs để không gửi lại hàng loạt; ledger/idempotency/import maps được giữ.
7. Verify counts, sampled hashes, graph invariants, nguồn/citation, login/reset recovery, private/public isolation và books/export.
8. Ghi thời gian thật, RPO thực, RTO thực, dữ liệu không khôi phục được, lesson learned. Chỉ promote theo approval và smoke lại URL.

Nếu không restore được Auth identity chính xác, dùng đường re-invite/re-link có manifest và kiểm tra không cấp sai membership; đây là phương án recovery phải được diễn tập, không lời hứa mơ hồ.

## Monitoring

Web liveness/readiness, error rate/p95, auth failures, DB connection/locks/storage, worker heartbeat, oldest outbox/job age, failed scan/upload, delivery suppression, backup age và bill usage. Alert quan trọng: last success backup >26h, worker không heartbeat >5 phút, queue oldest >15 phút, 5xx tăng, auth rate abnormal, storage gần quota.

Alert phải tới người thật đã xác nhận nhận được; chỉ tạo dashboard không ai xem không đủ. Threshold cần tinh chỉnh sau baseline để tránh noise. Logs retention ngắn và không PII; audit nghiệp vụ riêng có quyền và policy retention.

## Incident và thay người phụ trách

Có ít nhất hai người biết nơi lưu quyền truy cập/recovery nhưng không share password. Chuyển owner qua flow có audit, không xóa owner cuối. Offboarding thu hồi membership, sessions/capabilities/CI tokens, review signed links/export pending và quyền dashboard nhà cung cấp.
