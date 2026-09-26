# 02. Đặc tả sản phẩm và module bản 1

Mỗi module phải có dữ liệu thật qua DB, quyền ở server/DB, màn hình mobile, lỗi/empty/loading và kiểm thử. Một module bị tắt do chưa có nội dung thật vẫn phải được triển khai và nghiệm thu với demo.

| ID | Module | Phạm vi bắt buộc | Kết quả nghiệm thu cốt lõi |
|---|---|---|---|
| M01 | Trang chủ và nhận diện | Hero, tìm kiếm, liên kết nhanh, tin/lịch đã duyệt, giới thiệu, footer liên hệ người phụ trách | Khách chỉ thấy public projection; thành viên thấy nội dung theo quyền; không lộ số người ẩn |
| M02 | Lịch sử / phả ký | Trang lịch sử, mốc thời gian, các đời/chi, quy ước, bản nháp/xuất bản và nguồn | Không bắt buộc điền thủy tổ; mỗi mốc có nguồn hoặc nhãn chưa xác minh |
| M03 | Người và hồ sơ | Họ tên/biệt danh, ngày không đầy đủ, tiểu sử, sự kiện đời người, nguồn, media, mức riêng tư | Người không có tài khoản vẫn có hồ sơ; unknown được bảo vệ như người sống |
| M04 | Cây gia phả | Hậu duệ, tổ tiên, gia đình gần, nhiều root, expand/collapse, định vị, deep link, in phân trang | Không nhân bản bản ghi khi pedigree collapse; mobile có chế độ danh sách tương đương |
| M05 | Quan hệ / vai vế | Đường nối giữa hai người, phân biệt sinh học/nuôi/hôn phối, mô tả trung tính | Không khẳng định cách xưng hô khi không đủ dữ liệu; không đi xuyên qua cạnh bị ẩn |
| M06 | Tìm kiếm / chi nhánh | Có/không dấu, tên khác, chi, trạng thái, khoảng năm; sắp xếp và lọc | Trùng tên có ngữ cảnh phân biệt; pagination không lặp/mất; không lộ kết quả riêng tư |
| M07 | Gia nhập / tài khoản | Lời mời, xác minh email, đăng nhập, phục hồi, claim hồ sơ, MFA cho đặc quyền | Không tự nhận quyền nhờ cùng email trong gia phả; lời mời một lần, có hạn |
| M08 | Đóng góp / duyệt | Đề nghị tạo/sửa/quan hệ, diff, lý do, nguồn, review, conflict, thu hồi | Bản đã duyệt không bị ghi đè bởi đề nghị dựa trên version cũ |
| M09 | Tư liệu / nguồn | Upload, kiểm tra, ảnh/PDF/audio/video có giới hạn, nguồn/citation, album, alt text | File private không thể lấy qua đoán URL; ảnh bỏ EXIF GPS; original có checksum |
| M10 | Lịch giỗ / sự kiện | Âm–dương Việt Nam, recurrence, policy tháng nhuận/ngày 30, override, RSVP | Preview 3 lần tới; lưu ngày gốc; đổi quy tắc không gửi thông báo trùng |
| M11 | Thông báo | In-app/email, preference, chống gửi trùng, digest, retry và suppression | Không gửi tên nhạy cảm ra email; quyền được kiểm tra lại lúc gửi |
| M12 | Nội dung / tin tức | Tin họ, câu chuyện, FAQ, rich text an toàn, lịch xuất bản, archive | Draft không vào sitemap/cache; media trong bài tuân cùng quyền |
| M13 | Địa điểm / nhà thờ / mộ phần | Thông tin, ảnh, nguồn, tọa độ tùy quyền, đường đi qua link ngoài chủ động | Không công khai vị trí nhạy cảm; không tự tải map ngoài trước khi người dùng chọn |
| M14 | Quỹ họ / công đức | Sổ thu–chi có bút toán, duyệt hai người, hoàn/bút toán đảo, báo cáo, ẩn tên | Không sửa số tiền đã chốt; không biến thành cổng thanh toán hoặc phần mềm kế toán pháp định |
| M15 | Khuyến học | Chương trình, đề cử, xét duyệt, học bổng và liên kết bút toán đã chi | Hồ sơ trẻ em/tài liệu học tập riêng tư; công khai thành tích cần duyệt nội dung riêng |
| M16 | Import / export | CSV UTF-8, JSON chuẩn nội bộ, GEDCOM 5.5.1/7 subset có báo cáo, dry-run, mapping, export sách | Không mất trường âm thầm; unknown tags giữ raw và báo; dữ liệu nhạy cảm không nằm trong export phổ thông |
| M17 | Quản trị / chất lượng | Tài khoản/chi/quyền, duplicate queue, merge có duyệt, audit, soft delete, dashboard lỗi dữ liệu | Merge có preview ảnh hưởng, kiểm tra chu trình, version và phục hồi bằng sự kiện bù |
| M18 | Production / vận hành | CI/CD, backup DB+objects, restore, monitoring, quyền dữ liệu, admin manual, runbook | Có evidence diễn tập restore và handover; không còn demo không nhãn hoặc credentials mặc định |

## Luồng quan trọng nhất

J01: khách → giới thiệu → đăng nhập theo lời mời → tìm mình → xem gia đình gần.
J02: thành viên → đề nghị thêm con → gắn nguồn/quan hệ → reviewer chi → duyệt → cây cập nhật.
J03: quản trị → nhập sổ cũ → dry-run → phân loại không chắc chắn → xem diff → duyệt → áp dụng một lần.
J04: thành viên → lịch tháng → ngày giỗ âm/dương → chi tiết → RSVP → nhận nhắc theo lựa chọn.
J05: thủ quỹ → tạo thu/chi nháp → gửi duyệt → người khác chốt → báo cáo → sửa sai bằng bút toán đảo.
J06: yêu cầu ẩn dữ liệu → thu hồi public projection/media → hủy thông báo/xuất chưa chạy → purge cache → audit tối thiểu.
J07: sự cố → chế độ bảo trì → phục hồi DB và object manifest → đối chiếu → kiểm thử quyền → mở lại.

## Ngoài phạm vi bản 1

Không DNA/genetic profiling; không AI phán định quan hệ hoặc tự viết lịch sử thật; không public directory người sống; không chat/feed kiểu mạng xã hội; không mạng quảng cáo; không tự thu tiền; không ứng dụng iOS/Android native; không nhiều tổ chức trả phí trên cùng hệ thống. Kiến trúc có `tree_id` để cô lập dữ liệu, nhưng không vì thế được quảng cáo là SaaS multi-tenant hoàn chỉnh.

## Definition of Done toàn sản phẩm

Toàn bộ M01–M18 qua requirement/test traceability; không có blocker bảo mật, dữ liệu, mobile hoặc tài chính; những hạng mục ngoài phạm vi được nêu minh bạch; tài khoản dịch vụ thuộc chủ dự án; có release manifest, hướng dẫn vận hành và rollback. Tất cả chưa xảy ra tại thời điểm giao bộ tài liệu này.
