# 23. Checklist phát hành và định nghĩa “đã lên production”

Mỗi dòng có owner, trạng thái và evidence trong `state/RELEASE_GATES.json`; dấu tick không thay log thật.

## G1 — Sản phẩm và giao diện

M01–M18 đã triển khai; không placeholder button; 320px/390px/1440px; chữ tiếng Việt; H1 approved; mobile form/cây/tra cứu/RSVP dùng được; đủ empty/error/loading/restricted; không coi desktop-only admin là hoàn thành.

## G2 — Dữ liệu/domain

Ancestry cycle và race bị chặn; cross-tree FK; trùng tên/multiple unions/adoption/disconnected roots; dates không đầy đủ; generation theo root; imports idempotent/loss report; merge manifest; lunar golden tests; book/export giữ nguồn và privacy; ledger cân và 2-person approval.

## G3 — Quyền và bảo mật

Auth/JWT/session/MFA; membership không tự active; capability server/DB; private schema không exposed; helper authorization; no secret in artifacts; CSP/CSRF/XSS/SSRF/upload scan; unknown/minor/person/source/media redaction; no cache bleed; no public stats leak; bulk export audit; dependency/license scan đã xử lý.

## G4 — Vận hành

DB+objects backup đã phục hồi thử; keys owner giữ; last backup fresh; outbox/worker và mail thử hoạt động; provider region/accounts/budget H2; alert thử nhận được; restore/revocation/erasure replay; rollback image+schema plan; runbook/manual/handover.

## G5 — Kiểm thử và approval

Tất cả required tests PASS trên exact release commit; NOT_RUN quan trọng chưa được che; real devices có evidence; load/visual/a11y report; H3 chính sách thật khi DATA_MODE=real; H4 deployment approval, H5 nếu công bố dữ liệu thật. Risk exceptions có phạm vi/người duyệt/hạn xử lý, không áp dụng cho leak/mất dữ liệu/sai tiền.

## G6 — Smoke sau deploy

Domain HTTPS thực; public/private đúng; login/logout/recovery; find person/graph/source; proposal khác người duyệt; calendar/RSVP; journal; export; image/private 404; health and worker heartbeat; backup timestamp. Ghi URL, thời điểm, version/commit, mode demo/real và người xác nhận.

## Không được dùng các câu sau khi chưa đủ evidence

“Website production-ready” nếu chỉ có code/build. “Đã backup an toàn” nếu chưa restore files. “Chạy tốt mobile” nếu chỉ resize desktop. “Đã bảo vệ dữ liệu” nếu chỉ ẩn nút. “Dữ liệu đã nhập đúng” nếu chỉ parser count. “Đã hoàn thiện” khi module bị bỏ mà không được owner chấp thuận.

## Kết quả hợp lệ

Có thể bàn giao `RELEASE_CANDIDATE` khi chờ H2/H4, hoặc `PRODUCTION_DEMO` sau deploy có nhãn, hoặc `PRODUCTION_REAL` sau H5. Phải gọi đúng trạng thái; không gộp ba trạng thái thành “xong”.
