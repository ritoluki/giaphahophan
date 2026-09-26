# 09. Hợp đồng API

## Kiểu API và route

BFF HTTP JSON tại `/api/v1`, Next.js Route Handlers chạy Node runtime. Không có public GraphQL tùy ý. OpenAPI máy đọc được nằm ở `contracts/openapi.yaml`; docs này quy định semantics chung. Schema hợp đồng là chuẩn để agent sinh client và contract tests, không phải API đã được triển khai.

Browser dùng cookie session; Supabase server client dùng token của chính người gọi. Mọi mutation cookie-authenticated kiểm tra Origin/Host allowlist và CSRF token được ràng buộc session; CORS không wildcard credentials. Supabase JWT public key chỉ xác thực danh tính, role ứng dụng lấy từ DB. GET không được có tác dụng ghi nghiệp vụ.

## Response

Thành công đơn: `{data, meta:{requestId, version?}}`. Danh sách: `{data:[], page:{nextCursor,hasMore},meta}`. Lỗi: `{error:{code,message,fieldErrors?,requestId,retryable}}`. Không trả stack trace, SQL, bucket key hoặc thông tin người khác trong lỗi.

401: chưa xác thực; 403: biết tài nguyên nhưng không có capability dùng chức năng; 404: không tồn tại hoặc không được biết person/source/private asset; 409: version conflict hoặc idempotency key khác payload; 422: dữ liệu không hợp lệ; 429: rate/quota, có Retry-After; 503: dependency tạm lỗi. UI Việt hóa theo code, không đưa raw provider error.

## Mutation và chống lặp

Mọi create, submit, approve, merge, import commit, export request, RSVP và journal post có `Idempotency-Key` UUID. Server scope actor+tree+operation, hash canonical request body, lưu kết quả 24 giờ; cùng key/body trả cùng kết quả, key khác body trả 409. Domain-level unique key giữ chống lặp lâu hơn khi cần (import file+row, occurrence+recipient, reversal gốc).

PATCH/DELETE dùng `If-Match` dạng `"v7"` hoặc baseVersion trong typed command; thiếu trả 428. Không áp dụng last-write-wins cho dữ liệu gia phả. Client giữ phiên bản trên form; conflict hiển thị base/current/proposed, cho rebase có chủ đích.

## Phân trang và giới hạn

Danh sách mặc định 20, max 100; autocomplete max 8. Cursor opaque được ký hoặc base64 chứa sort key không PII cộng kiểm tra tenant; không dùng cursor của user khác để bypass scope. Tree max 120 mobile/300 desktop, depth mặc định 3/max 6 mỗi request. `truncated=true` kèm lý do và cách expand, không giả vờ cây đã đầy đủ.

Request JSON max 1MB; import đi đường upload riêng. Graph/kinship query có budget/timeouts. Public API không trả total count của record ẩn. Search do server lọc trước pagination/count; không lọc sau khi đã chọn page.

## Tập endpoint

Auth/session và claim; public content; persons/search/family/graph/kinship; branches; proposals/review; sources/media; event rules/occurrences/RSVP; notifications/preferences; content/publication; places; funds/journal/scholarships; import/dry-run/commit; export/status/download; quality/merge; members/grants; privacy requests; audit; health/readiness. Danh mục chi tiết và request/response trong OpenAPI.

Các endpoint `/health/live` và `/health/ready` không in secrets/version dependency đầy đủ. Live chỉ chứng minh process; ready kiểm tra DB và configuration tối thiểu, dependency email/worker có báo degraded nội bộ thay vì tự restart mọi web instance.

## Upload/download

`POST media/uploads` tạo upload intent, kiểm tra MIME khai báo/size/quota/capability, đặt path random trong quarantine. Upload direct private bucket bằng token ngắn hạn giới hạn object; không cho client chọn bucket/path. Finalize HEAD object, so checksum/size, kiểm tra file magic, đặt scan pending; chưa scan không được xuất bản.

Read asset kiểm tra quyền hiện thời và asset state=ready; proxy private derivative hoặc signed URL TTL 60s. Tệp đã tải về không thu hồi được; signed URL còn hiệu lực đến hết TTL. Hạn chế nhạy cảm dùng proxy có no-store, không Next image optimizer public cache. Export download có quyền lại và TTL; links không đưa vào email công khai.

## Long-running jobs

Import parse, export sách, media processing, backup chạy worker. POST trả 202 + jobId; GET status trả counters `processed/succeeded/failed/skipped`, errors có row number nhưng không log PII. Cancel best-effort giữa batch; state cancelled không đảo batch đã committed, phải có báo cáo những gì đã ghi. UI không giả completed khi queued.

## Consistency FE/BE

Mỗi ticket đổi API phải sửa OpenAPI, generated client, server validation và test cùng PR. Breaking contract tạo v2 hoặc backward-compatible expansion trước; không triển khai FE gọi field mới trước khi BE tương thích. Release manifest ghi web/worker/schema/contract version.
