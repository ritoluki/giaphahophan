# 08. Mô hình dữ liệu và bất biến lưu trữ

## Thiết kế nền

PostgreSQL là nguồn dữ liệu duy nhất của nghiệp vụ. `auth.users` do Supabase quản lý; dữ liệu gia phả đặt trong schema `private`, không đưa bảng gốc lên Data API. Schema `api` chỉ có các wrapper `SECURITY INVOKER` đã cho phép; wrapper gọi helper `private` để lấy projection hoặc mutation có kiểm tra quyền. Mọi helper đặc quyền phải pin search_path, schema-qualify, thu hồi EXECUTE mặc định và tự xác định actor từ JWT hợp lệ. [S06][S08]

`database/schema.blueprint.sql` là blueprint cấu trúc fail-closed, **không phải bộ migration hoàn chỉnh được phép chạy production**. Agent tạo migration có version, grants, RLS, functions và test từ blueprint. Không mở SELECT/UPDATE đại trà chỉ để UI chạy.

## Trường chung

Mọi aggregate nghiệp vụ có UUID, tree_id, created_at, updated_at, created_by khi có actor, version bigint và deleted_at khi soft-delete được cho phép. Foreign key giữa các bảng cùng tree dùng cặp `(tree_id,id)`; không chỉ dựa vào application filter. Mã hiển thị unique trong tree, không bắt buộc liên tiếp và không tiết lộ số lượng bản ghi.

Ngày nghiệp vụ lưu cấu trúc có precision; timestamp chỉ cho event hệ thống. Số tiền là bigint VND; JSON truyền integer string. Chuỗi Unicode chuẩn NFC ở biên, giữ bản gốc; trường name_search chuẩn hóa không dấu để tìm kiếm nhưng không thay display_name.

## Nhóm bảng

| Nhóm | Bảng chính | Ý nghĩa và ràng buộc |
|---|---|---|
| Tổ chức | trees, branches, person_branches | Một tree hoạt động ban đầu; branch hierarchy không cycle; membership chi không suy từ tên |
| Tài khoản | memberships, capability_grants, invitations, person_claims | Membership active/pending/suspended/revoked; role lưu DB; token mời hash; claim phải duyệt |
| Người | persons, person_names, person_private, person_facts | Tên/alias, trạng thái sống, thông tin nhạy cảm riêng; date theo JSON schema; không tài khoản mặc định |
| Quan hệ | unions, union_partners, union_children, parent_links | Hôn phối độc lập huyết thống; composite FK cùng tree; ancestry lock và cycle checks |
| Nguồn | sources, citations | Source mô tả tài liệu/lời kể; citation liên kết một fact/edge/nội dung có vị trí cụ thể |
| Tư liệu | media_assets, media_links, albums, album_items | Original private/quarantine, checksum, derivatives, quyền không suy từ việc được link vào bài |
| Nội dung | content_pages, content_revisions, publications | Draft và published snapshot riêng; published projection tối thiểu và có guard quyền |
| Lịch | event_rules, event_occurrences, event_rsvps | Quy tắc là nguồn thật; occurrence là cache có rule_version/algorithm_version |
| Cộng tác | proposals, proposal_items, review_decisions, audit_events | Base version, diff có schema, người duyệt và lý do, không client gán approved |
| Import | import_jobs, import_rows, external_id_map, merge_operations | Hash file, parser version, mapping, deterministic idempotency, manifest tác động |
| Thông báo | notification_preferences, notifications, delivery_attempts, outbox | Dedupe key, pending/claimed/sent/suppressed/failed; không lưu payload PII dư thừa |
| Địa điểm | places, burial_records | Tọa độ là trường nhạy cảm; nơi thờ/địa danh khác nơi ở; source/visibility độc lập |
| Quỹ | funds, fund_accounts, journal_entries, journal_lines | Balanced journal, immutable sau posted, không self-approve, reversal tham chiếu gốc |
| Khuyến học | scholarship_programs, scholarship_applications, scholarship_awards | Nhóm quyền riêng; tiền chi tham chiếu journal, không đếm hai lần |
| Tuân thủ/vận hành | consent_records, privacy_requests, export_jobs, retention_jobs | Consent có audience/field/time/version; export snapshot redacted; retention có policy |

Chi tiết từng trường, index và lifecycle nằm trong `contracts/data-dictionary.json` và docs 31. Entity type/enum nằm trong `contracts/domain.types.ts`. Việc chưa có migration ứng dụng thực không được che bằng cách gọi blueprint là schema đã kiểm thử production.

## Person core

`display_name` bắt buộc (hoặc nhãn placeholder do người nhập xác nhận); `recorded_sex` optional, không suy. `life_status=living|deceased|unknown`; `visibility=public|members|restricted` nhưng public chỉ là ý định, effective visibility còn phụ thuộc consent/publication/tuổi/quyền. `preferred_name_id`, `primary_branch_id`, `portrait_asset_id` đều nullable.

`person_private` chứa contact_ciphertext, key_id và metadata cần thiết, không nằm trong PersonSummary hoặc search index. Không thu thập CCCD/hộ chiếu, bệnh án, DNA hoặc nghề nghiệp/địa chỉ chi tiết nếu không có mục đích rõ. Birthdate chính xác của người sống cũng được projection theo audience; members không đồng nghĩa được xem mọi field.

## Nguồn và citation có FK thật

`citations` dùng các FK nullable có CHECK exactly-one-target giữa fact_id, parent_link_id, union_id, person_id, content_revision_id, place_id, event_rule_id. Tránh generic target_type/target_id không ràng buộc gây orphan. Media links dùng mô hình tương tự. Nếu schema tăng thêm target, migration và test phải cập nhật cùng lúc.

## Index và truy vấn

Index đầu tree_id và deleted_at/status khi phù hợp; parent_links theo parent và child; person_names(name_search) dùng trigram GIN sau spike extension; btree cho code exact; event_occurrences(tree_id,occurs_on,status); proposals(tree_id,status,submitted_at); unique idempotency scope actor+tree+operation+key.

Search normalization do hàm được version hóa, `unaccent` không mặc định IMMUTABLE; không tự gắn immutable wrapper nếu mapping có thể đổi. Có thể materialize name_search bằng trigger và backfill khi phiên bản normalization thay đổi. Pagination keyset `(sort_key,id)`, không OFFSET sâu hoặc cursor chứa PII plaintext.

N+1 phải được kiểm thử bằng số query. Graph projection lấy theo nhánh/độ sâu giới hạn và permissions trước khi trả; không dump all graph rồi lọc browser. Explain analyze chạy trên synthetic benchmark, không ghi dữ liệu thật vào PR.

## Mutation transaction chuẩn

Kiểm tra actor đang active và capability trong DB → kiểm tra MFA/fresh authorization cho tác vụ nhạy cảm → idempotency → lock theo resource/tree nếu cần → so sánh version → validate toàn bộ payload → ghi aggregate và liên quan → audit event tối thiểu → outbox trong cùng transaction → commit → trả DTO đã lọc quyền.

Review approval phải khóa proposal và target; reject stale base_version bằng 409. Không dùng mô hình “bấm duyệt rồi worker sửa sau” cho thay đổi gia phả, vì UI có thể báo approved nhưng DB chưa cập nhật. Worker chỉ xử lý side effect hoặc batch dài với trạng thái rõ.

## Xóa và retention

Soft-delete không làm lộ thông tin qua search/edge/cache. Purge có manifest những FK/tệp cần xóa, người duyệt và thời hạn. Sau restore, replay erasure tombstones trước mở dịch vụ để không hồi sinh dữ liệu đã yêu cầu xóa. Backup chỉ được giữ trong thời hạn chính sách, không dùng soft-delete như lý do lưu vô hạn.
