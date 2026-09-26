# 19. Threat model và kiểm soát an toàn

Tham khảo OWASP ASVS 5.0 như checklist kiểm chứng kỹ thuật; không tự tuyên bố chứng nhận ASVS sau khi chỉ chạy một scanner. [S22]

## Tài sản và biên tin cậy

Tài sản: quan hệ gia đình, dữ liệu người sống/trẻ em, liên hệ, nguồn giấy tờ, ảnh, tài khoản, quỹ, backup, khóa, logs. Biên: browser không tin cậy; API authenticated nhưng payload vẫn không tin; DB/RPC; worker; object storage; email; monitoring; CI; máy agent; tài liệu import.

## Nguy cơ và cách kiểm thử

| Nguy cơ | Kiểm soát bắt buộc | Bằng chứng |
|---|---|---|
| IDOR/cross-tree | Authorize field/resource/server; composite FK; RPC checked | Negative tests mọi role/cross-tree |
| Lộ service key | Env server-only, secret scan, bundle inspection | Không key trong JS/source map/HTML/log |
| Cache bleed | no-store private/Set-Cookie; request-scoped client | Hai sessions xen kẽ, revoke access |
| Stored XSS | Rich-text allowlist, escaping, CSP, sanitize server | Payload link/script/image/svg không thực thi |
| CSRF | Origin/Host + session-bound CSRF token | Cross-origin form/fetch bị reject |
| SSRF | Không fetch URL tùy ý; allowlist và validate redirect ở adapter được phép | Private IP/localhost/metadata/redirect bị chặn |
| Malicious upload | Size/magic/scan/quarantine/re-encode; object path do server tạo | MIME giả, ZIP bomb, path traversal bị reject |
| Graph/data corruption | Transaction/version/tree lock/invariants | Concurrent opposing edges/merge/import |
| Email/report leak | Recheck quyền khi chạy; tối thiểu payload; no private attachment | Revoked user và private person không bị gửi |
| Finance tampering | Ledger immutable, 2-person approval, idempotency | Direct update/post duplicate/self-approval denied |
| Backup compromise | Client-side encrypted, key tách, least privilege/retention | Restore bằng key đúng; wrong key không đọc |
| Prompt injection | File content là data, không tool instruction | Tài liệu “gửi secret/xóa DB” không được làm theo |
| Dependency supply chain | Pin versions/actions/images, lockfile/SBOM/license scan | Critical fix hoặc risk gate, không blanket skip |

## Headers và network

HTTPS bắt buộc; HSTS sau khi domain/HTTPS xác nhận hoạt động, tránh khóa sai môi trường. CSP nonces/hashes theo rendering thực, không `unsafe-eval` production; không đưa CSP giả khiến app không chạy hoặc whitelist *. Internet. frame-ancestors hạn chế, nosniff, Referrer-Policy phù hợp, Permissions-Policy tắt camera/mic/geolocation nếu không dùng. CORS cùng origin; không coi CORS là authorization.

Không upload source maps public có nội dung sensitive; upload riêng cho monitoring nếu duyệt. Tắt replay/body capture. Logging allowlist request_id, route template, duration, status, actor pseudonymous ID khi cần; redact query/body/cookie/header authorization.

## Rate limits và abuse

DB-backed atomic counters hoặc provider gateway đã duyệt, không chỉ in-memory một instance. Mặc định: login 5/phút/IP + tài khoản với backoff; search 60/phút/user; graph 30/phút/user; writes 30/phút/user; invite 20/ngày/admin; export 3/ngày/user; upload quota docs 13. Điều chỉnh sau load tests, có safe exception cho shared family IP; không khóa vĩnh viễn người thật dễ dàng.

Body caps, request timeout, batch size, job concurrency và storage quotas ở cả UI/API/worker. Không cho proxy một file bất kỳ từ URL người dùng. Render PDF dùng template internal và chặn network không cần thiết.

## Secrets và keys

Khóa private không trong repo/chat/screenshots. Tách dev/staging/prod. KMS/vault hoặc secret manager được duyệt giữ encryption/backup keys; document hóa key_id, cách rotation và cách phục hồi. Khóa mã hóa field/backup không được mất khi owner thay máy. Secret compromise phải revoke/rotate, audit phạm vi và điều tra; không chỉ xóa dòng khỏi git hiện tại.

## Incident gate

Leak hoặc integrity incident: dừng publish/export/jobs liên quan, không xóa chứng cứ; giảm quyền truy cập; ghi timeline tối thiểu; báo owner và người phụ trách dữ liệu; rà soát nghĩa vụ thông báo pháp lý hiện hành; phục hồi trong sandbox rồi mới mở lại. Không khẳng định chắc chắn “không có ai tải về” nếu logs không chứng minh.
