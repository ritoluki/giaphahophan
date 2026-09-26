# 18. Chiến lược kiểm thử và nghiệm thu

## Các lớp kiểm thử

Unit: genealogy dates, normalization, lineage/generation, path/kinship, visibility evaluator, journal rules, recurrence, idempotency. Property-based: graph DAG/merge invariants, date round-trip, repeated jobs, unbalanced journals. DB tests: constraints, composite FK, grants/RLS/RPC, concurrent graph writes, owner-final guard, row locks/version.

Integration: auth session, Supabase Storage private paths, upload state, outbox/queue, parser/import, email stub và provider sandbox, export redaction. E2E: toàn bộ J01–J07 trên ứng dụng và DB thật. Mocks chỉ dành test cô lập, không thay integration để đóng module.

Security: IDOR, cross-tree, role escalation, anonymous direct RPC, service key exposure, source/media leak, XSS, CSRF, SSRF, parser injection, stale sessions, export/notification after revocation. UI/accessibility: keyboard, VoiceOver/TalkBack, responsive, typography dấu tiếng Việt, form under keyboard. Ops: backup+restore+erasure replay+rollback.

## Test dataset

Fixture nhỏ deterministic có các trường hợp: root chưa nối, trùng tên, tên dài/dấu, year-only, unknown life status, người sống, người dưới 18 (synthetic), nhiều union, con nuôi, guardian, disputed edge, pedigree collapse, branch overlap, private source, private portrait, ngày âm tháng nhuận, hai users sửa cùng người.

Fixture invalid riêng: self-parent, cycle một request, cycle hai request chạy đồng thời, cross-tree FK, invalid leap month, ngày 30 không hợp lệ, journal không cân, tự duyệt, MIME giả, file path traversal, CSV formula, mất source, revoked member. Invalid fixtures không được seed như dữ liệu hợp lệ.

Benchmark: 10k persons/30k edges tối đa theo graph hợp lệ và configurable media metadata; stress 50k riêng. Không đưa ảnh/file thật vào benchmark. Seed lặp idempotent hoặc dùng namespace mới có manifest.

## Tiêu chí số lượng và độ bao phủ

Domain critical branch coverage mục tiêu ≥90%; application coverage là tín hiệu phụ, không được dùng để bỏ test integration. Ít nhất một happy path, error, denied và mobile case cho mỗi requirement quan trọng. Requirement traceability phải phủ toàn M01–M18; fail nếu có requirement không có test hoặc test không có bằng chứng release.

Không đặt tỷ lệ coverage thay cho độ đúng. Một cycle test tuần tự không thay concurrency test; một screenshot không chứng minh private payload sạch. Đánh dấu test flaky, tìm nguyên nhân; không bỏ test khỏi release mà không có lý do/risk approval.

## Nghiệm thu quyền

Test trực tiếp bằng HTTP/Data API/RPC với visitor, suspended member, member tree khác, member cùng tree, editor khác chi, reviewer, admin thiếu grant và owner. Gọi bypass UI với UUID biết trước. Kiểm tra response body, HTML/RSC, caches, blob download, file metadata, counts, error messages và logs.

Tạo 2 phiên người khác nhau, request xen kẽ để tìm cache bleed; revoke một user trong khi access token chưa hết hạn; sensitive action phải từ chối nhờ getUser/session + membership check. Verify no unprotected SECURITY DEFINER wrapper.

## Nghiệm thu mobile

320/360/390/412px không tràn toàn trang; touch targets, safe area, focus/keyboard; tìm người, mở hồ sơ, family view, đọc nguồn, RSVP và proposal làm được một tay. Cây fullscreen thoát được và không nuốt scroll trang khi chưa kích hoạt. Physical iPhone Safari và Android Chrome cần kết quả thật, có OS/browser/device; nếu không có thiết bị, ghi NOT_RUN và H4 chưa được khẳng định đạt gate thiết bị thật.

## Performance và reliability

Theo budget docs 06. Load test read 50 concurrent và write mix được giới hạn, chạy trên staging synthetic đúng sizing; không load production hoặc email thật không xin phép. Theo dõi p50/p95/p99, error rate, connection count, query plans và memory. Tắt worker rồi bật lại: outbox không mất, side effects không nhân đôi; simulate crash sau provider accepted nhưng trước DB mark sent để kiểm tra idempotency/reconciliation.

## Release evidence pack

`reports/<release>/manifest.json`, commands.log, unit/integration/e2e summaries, DB policy report, accessibility report, visual screenshots, load report, dependency/license/SBOM scan, restore report, privacy/release approvals. Reports dùng synthetic data hoặc redacted, không chứa access token/cookie/PII. Evidence phải gắn exact commit và image digest.

## Severity và gate

P0: leak dữ liệu, auth bypass, mất/nhân dữ liệu lớn, sai tiền, sai ngày gửi hàng loạt; block release. P1: core flow/mobile không dùng được, backup không restore, merge/import sai; block release. P2: chức năng phụ có workaround rõ, cần owner risk acceptance có thời hạn nếu release. P3: visual polish nhỏ không vi phạm yêu cầu font/contrast; vẫn vào backlog.

Không coi release-ready nếu còn NOT_RUN ở các gate trọng yếu. Những benchmark/số đo trong bộ hồ sơ này là tiêu chí, chưa có kết quả ứng dụng thực.
