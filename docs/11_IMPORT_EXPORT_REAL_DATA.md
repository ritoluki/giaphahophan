# 11. Nhập liệu, trao đổi dữ liệu và đưa tư liệu thật vào hệ thống

## Mục tiêu

Nhập nhiều thế hệ mà không tạo người trùng, không phá quan hệ, không mất thông tin nguyên bản và không tự công khai dữ liệu. Thành công của import là dữ liệu được kiểm tra và đối chiếu, không phải số row parser đọc được.

## Định dạng bản 1

CSV UTF-8 và JSON theo schema nội bộ là đường nhập chuẩn. Người có Word/PDF/ảnh được tải lên làm nguồn; nhập có hỗ trợ qua form hoặc chuyển thành staging rows do người duyệt xác nhận. Không coi upload PDF là đã tự đọc đúng gia phả.

GEDCOM 5.5.1 và GEDCOM 7 được hỗ trợ **theo subset có công bố**, với conformance report. GEDCOM là chuẩn trao đổi gia phả; bản 7 có cấu trúc cá nhân, gia đình, sự kiện, nguồn và cơ chế extension. [S12] Không hứa round-trip mọi extension của mọi phần mềm.

## GEDCOM mapping bắt buộc

| Nhóm | Nhập | Xuất | Quy tắc |
|---|---|---|---|
| INDI / NAME / SEX | Có | Có | Giữ raw name, aliases; sex không suy từ tên |
| BIRT / DEAT / BURI / DATE / PLAC | Có subset | Có subset | Giữ ABT/BEF/AFT/BET/AND và lịch/độ chính xác |
| FAM / HUSB / WIFE / CHIL | Có | Có | Tên tag không ép giới tính; relationship ambiguity phải review |
| FAMC / FAMS / PEDI | Có subset | Có subset | Phân biệt quan hệ nuôi/sinh học khi có bằng chứng; không mặc định chắc chắn |
| SOUR / NOTE / OBJE | Có subset | Có subset | Raw notes private; media path không được truy cập tùy ý |
| Tags không biết / extension | Preserve raw + warning | Xuất raw nếu an toàn và tương thích | Không tự drop, không tự diễn giải |
| Âm lịch Việt Nam / quỹ / quyền app | Extension/sidecar riêng | JSON sidecar là chuẩn lossless | Không ghi ngày âm như Gregorian DATE |

### Import profile đang triển khai

`gedcom-subset/1` nhận GEDCOM 5.5.1 và FamilySearch GEDCOM 7 dạng UTF-8, có `HEAD`/`GEDC.VERS`/`TRLR`, tối đa 10 MiB và 10.000 top-level records. Parser normalize `INDI.NAME` và name pieces, `SEX` (không suy luận), `BIRT`/`DEAT` với `DATE`/`PLAC`, `FAMC`/`FAMS`/`PEDI`/`STAT`, cùng `FAM.HUSB`/`WIFE`/`CHIL`/`MARR.DATE`. `ABT`/`CAL`/`EST`/`BEF`/`AFT`, năm/tháng/ngày không đầy đủ và lịch Julian được giữ độ chính xác; lịch không nhận diện hoặc date range phức tạp giữ nguyên text để review.

Tag chuẩn đã biết nhưng chưa normalize (ví dụ `NOTE`, `SOUR`, `OBJE`, `BURI`, `CONT`/`CONC`) và extension lạ được phân loại riêng trong conformance report; mọi root record và raw line vẫn ở staging riêng tư để không mất dữ liệu. `_PHAN_LUNAR_DATE` và `_PHAN_PRIVACY` được giữ như app sidecar; ngày âm không đổi thành ngày dương. Quan hệ dùng external xref; pointer thiếu thành `needs_review`; tên `HUSB`/`WIFE` không quyết định giới tính. Notes, source payload và đường dẫn media không đi vào preview công khai; quyền riêng tư mặc định `restricted`.

Profile chỉ chấp nhận UTF-8 hiện tại; nguồn encoding khác cần được chuyển đổi có kiểm tra trước khi upload. GEDCOM export/round-trip chưa được cung cấp bởi profile này; không được hiểu parser/import PASS là export PASS.

Agent tạo fixture từ nguồn chuẩn và từ hai phần mềm nguồn mở được phép dùng; test import/export semantics chứ không byte-equality của thứ tự tag. Profile hỗ trợ/không hỗ trợ phải được hiển thị trước import và đính kèm export.

## Pipeline nhập thật

1. **Intake:** tạo batch ID, xác định người cung cấp, quyền sử dụng, tree đích, tài liệu gốc, checksum, loại tài liệu và ghi chú. Original immutable; không chỉnh đè scan.
2. **Parse an toàn:** sandbox parser; giới hạn 25MB structured file, 10.000 người/batch, tối đa 100MB sau giải nén; reject zip path traversal, decompression bomb, XML external entity. Không fetch URL trong GEDCOM/Word hoặc macro.
3. **Normalize:** Unicode NFC, tên search riêng, date precision, map external ID; giữ raw nguyên văn và mọi warning. Không invent 01/01, không nối người theo tên.
4. **Stage:** tạo persons/edges/facts chưa áp dụng; các row có `ready|needs_review|invalid|duplicate_candidate|excluded`. Privacy default restricted.
5. **Dry-run:** tính số tạo/cập nhật/bỏ qua/cần duyệt/lỗi; preview diff, cycle/cross-tree/date warnings, ảnh hưởng quyền; report có parser/mapping/schema version và source hash.
6. **Duyệt:** reviewer xem rows bất thường, chủ dự án xác nhận batch thật H5; approve phạm vi rõ. Bất cứ sửa mapping/file/target version nào làm approval hash mất hiệu lực.
7. **Apply:** xác thực lại quyền, base snapshot/version, idempotency; ghi theo manifest; outbox cho indexing/projection, không email hàng loạt mặc định.
8. **Reconcile:** kiểm tra counts, số cạnh, roots, người chưa nối, sampled citations và kiểm tra riêng tư; xuất report. Chỉ hoàn thành khi mismatch được giải thích.

## Idempotency và batch lớn

Khóa import = tree + source file SHA-256 + mapping version + import mode. Mỗi source row có external_id_map unique theo tree/namespace/external ID/entity kind, không gán lại UUID mỗi lần retry. M16-04 hiện reserve map private trong lúc staging; đây chưa phải canonical apply. Apply lần hai cùng input phải không nhân đôi dữ liệu.

Batch nhỏ (mặc định ≤2.000 entities) có thể commit atomic sau test kích thước. Batch lớn dùng chunk có manifest và trạng thái `partially_applied`; tuyệt đối không báo rolled_back nếu đã commit chunk. Mỗi chunk kiểm tra quyền/versions và ancestry lock khi thay cấu trúc. Cancel dừng chunk tiếp theo; report chỉ rõ phần đã áp dụng. Undo import là compensating operation theo manifest, không delete bừa người đã có người khác sửa.

## Dữ liệu thật từ giấy, Word, ảnh

Agent phân loại: tài liệu gốc; bản trích xuất máy; bản biên tập; bản đối chiếu/duyệt. Những lớp này không trộn thành một “sự thật”. Mỗi thông tin nhập dẫn được về số trang/vị trí/source. OCR/AI là tùy chọn có approval; kết quả chưa duyệt không trở thành canonical fact. Không yêu cầu người dùng gõ lại toàn bộ nếu có thể hỗ trợ parsing, nhưng phải trình bày chỗ không chắc chắn.

## Xuất dữ liệu

Xuất danh sách CSV theo field quyền, JSON full-fidelity theo scope, GEDCOM subset kèm warning/sidecar, PDF “Sách gia phả” và SVG/PDF phả đồ phân trang. Bản sách có mục lục, mã hồ sơ, quan hệ, ngày chính xác/ước tính, citation và ngày biên soạn. Không render toàn bộ 10k người thành một ảnh không đọc được.

Export job lưu requested_by, purpose, scope, policy snapshot version và expires_at. Kiểm tra quyền lúc tạo, lúc chạy và lúc tải. Bulk export cần capability + MFA + audit; member chỉ xuất phạm vi cá nhân được duyệt, không bản toàn họ. File export private, hết hạn 24h mặc định; không email attachment chứa dữ liệu thật.

CSV chống spreadsheet formula injection ở cell bắt đầu =,+,-,@ hoặc control character; giữ raw trong JSON, document hóa escaping CSV. ZIP export không có path traversal; manifest SHA-256 từng file. GEDCOM/private export không coi token link là đủ authorization.

## Tiêu chí nghiệm thu

Ngày year-only và lunar leap round-trip qua JSON không đổi; GEDCOM unknown tag có report; import lặp không tăng count; lỗi một phần có manifest đúng; merge không tự theo tên; file độc hại không được thực thi; export permission-filtered không chứa PII đã ẩn; erasure trong thời gian job chờ làm export bị hủy/recompute an toàn.
