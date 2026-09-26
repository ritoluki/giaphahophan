# 30. Chi tiết triển khai các luồng khó

## 1. Publish một thay đổi gia phả

BFF validate JSON → verify session/user nếu nhạy cảm → RPC với user JWT → private helper lấy actor từ auth.uid() và active membership → lock tree hoặc aggregate → đối chiếu proposal/baseVersion → kiểm tra reviewer khác tác giả khi required → validate proposed graph/date/field policy → write rows → append audit diff tối thiểu → outbox invalidate projections → mark proposal approved trong cùng transaction → trả projection theo actor.

Thứ tự này ngăn trạng thái approved mà data chưa đổi. Transaction lỗi thì toàn bộ rollback. Kết quả response được lưu theo Idempotency-Key; retry không duyệt hai lần. Version tăng trên mọi aggregate bị ảnh hưởng, graph_revision tăng khi thay cấu trúc.

## 2. RLS/RPC security pattern

Bảng gốc nằm private và RLS enabled, không grant trực tiếp cho anon. `api.person_get` là SECURITY INVOKER wrapper nhận person_id, không nhận “viewer_role” từ client. `private.person_get_authorized` pin search_path và tự kiểm tra JWT actor/membership/field policy, trả allowlisted DTO, không `row_to_json(persons.*)`.

Grant EXECUTE cụ thể, không ALL FUNCTIONS cho mọi user. Revoke default public execute của helper. Definer function trong private không tự động an toàn: kiểm tra authorization, SQL injection và output phải có test. Views nếu có phải security_invoker khi phù hợp; không tạo view owner-bypass vô tình expose toàn bộ bảng. [S08]

## 3. Cấu trúc graph projection

Canonical person/union IDs không đổi; occurrence ID = hash(root, traversal path, canonical id, mode) để biểu diễn pedigree collapse. Server chọn neighborhood theo quyền, depth, cap và continuation; client ELK layout data đã lọc, không làm authorization. Kết quả có nodes/edges, roots, graphRevision, truncated, nextExpansion và warnings không chứa bí mật.

Expand gắn node hiện tại với cap mới, preserve viewport anchor; không tự fitView toàn bộ khiến mất vị trí. Dữ liệu cũ khi request mới đang chạy có nhãn đang tải, không merge kết quả thuộc root khác. AbortController và request sequence ngăn response chậm ghi đè response mới.

## 4. Job/outbox

Outbox row chỉ chứa resource IDs, event type, revision, tree, actor do server gán và dedupe key; không chứa nguyên văn PII nếu không cần. Dispatcher lấy batch với FOR UPDATE SKIP LOCKED hoặc cơ chế tương đương được test, gửi pg-boss rồi mark published an toàn bằng dedupe/reconciliation. Không giữ lock DB trong khi gọi mạng lâu.

Worker handlers có timeout, maxAttempts, exponential backoff với jitter, dead-letter và thao tác retry có audit. `process(job)` recheck resource state/grant/consent hiện tại, claim idempotency business key, gọi provider với idempotency key khi hỗ trợ, lưu provider ID, mark result. Nếu crash ở ranh giới provider accepted/DB chưa ghi, reconcile thay vì gọi lại vô hạn.

Worker role không được tự chọn user từ payload HTTP. `requested_by` được lưu lúc authenticated request, client không sửa; job execution dùng private function kiểm tra queued job ID/state và principal từ DB. Không giả auth.uid bằng một tham số do người dùng đưa.

## 5. Normalization và ngày

Display giữ NFC nguyên gốc; search map lowercase/diacritics và đ→d, whitespace collapse; có normalizationVersion. Không overwrite display bằng search key. Ngày tháng có schema validation và domain validator, dùng plain date object; exact ngày âm leap phải được adapter xác nhận trong range.

Trường thông tin chưa biết không default theo clock. Sort ngày không đầy đủ dùng khoảng min/max để cảnh báo/hiển thị, không giả một ngày exact. Range inconsistent reject, dates historic text được giữ khi không parse chắc chắn.

## 6. Permission-aware cache/search

Public article cache chỉ chứa DTO được phép; identity/consent-bearing route dùng no-store và current policy guard. Per-user cache tối đa request scope ở bản 1, không Redis cache để sớm tối ưu. Search index DB chứa permitted searchable fields; output/filter/count do actor policy. Sensitive fields không index FTS chung.

Quyền thay đổi tăng policy_version và outbox invalidation; authorization đọc trạng thái hiện thời, không đợi worker mới deny. Nếu worker chết, thu hồi quyền vẫn có hiệu lực tại read path. Revocation của signed URL phải nêu giới hạn TTL.

## 7. Export sách

Tạo immutable redacted snapshot theo scope tại job start; recheck permission trước render/download. Template HTML internal, escape content, ảnh chỉ signed/internal resolved đã xác thực, network egress allowlist. Chia sách theo chi/đời; TOC/citation/page number; profile dài được chia trang, không fixed-height clipping. Graph lớn phân panel/A3 tùy chọn, không ép fit 10k node vào A4.

Export format selection có warnings GEDCOM loss; JSON+media manifest là lossless package cho dữ liệu app được phép xuất. Token download short-lived không đủ nếu quyền bị revoke sau tạo: BFF guard lại.

## 8. Hoàn thành không phụ thuộc dữ liệu thật

Mọi domain/schema/route/test phải chạy bằng synthetic dataset. Chỉ lịch sử thật/nhân vật thật/consent/region/cost cần owner. Agent không được đợi gia đình cung cấp toàn bộ giấy tờ mới viết auth/search/tree; cũng không được bịa những dữ liệu thiếu để “đủ màn hình”.


## Hợp đồng quyền SQL cần kiểm chứng khi chuyển blueprint thành migration

Wrapper `api.*` là SECURITY INVOKER. Caller `authenticated` cần USAGE schema `api` và `private`, cùng EXECUTE đúng wrapper và đúng helper `private.*` đã tự kiểm tra auth.uid/capability; không GRANT SELECT bảng private hàng loạt. Grant là cho role, không phải cho một function như thể function là role. Schema private không nằm trong exposed schemas của Data API. SECURITY DEFINER helper dùng owner role tối thiểu, search_path rỗng, tên schema đầy đủ; không tin actor/tree từ input, không bypass vì function nằm private. Mọi helper có test gọi trực tiếp bằng JWT member/anon và xuyên tree. Trước khi có helper được kiểm chứng, blueprint đóng toàn bộ quyền mặc định.

FK created_by → auth.users trong blueprint mặc định restrict. Migration triển khai phải chọn rõ chính sách xóa tài khoản: nullable attribution dùng ON DELETE SET NULL sau khi giữ audit label đã tối thiểu hóa; trường nghiệp vụ cần lưu không được cascade xóa genealogy/ledger. Quy trình privacy phải thử user deletion và auth restore để tránh treo vì FK. Không xóa lịch sử tài chính/gia phả hàng loạt khi một tài khoản bị xóa.

Từ điển trạng thái canonical: visibility=public/members/restricted; recorded_sex=M/F/X/U; journal=draft/submitted/posted/rejected; reverse là liên kết journal mới, không sửa trạng thái tùy ý. API camelCase chỉ đổi tên field, không tự sáng tạo enum khác. Event recurrence=once/annual_lunar/annual_solar. GenealogyDate.month_day lưu ngày và tháng khi không biết năm. Sửa field protected bằng CRUD phải trả PROPOSAL_REQUIRED, không âm thầm đổi response thành Proposal.
