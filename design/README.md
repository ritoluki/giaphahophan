# Mẫu giao diện để duyệt phong cách

Mở `preview.html` trực tiếp trong Chrome/Edge/Safari. Không cần server, cài package hoặc kết nối internet; không gửi dữ liệu ra ngoài. Prototype dùng font có sẵn trên máy (Georgia/Arial làm fallback), vì bộ tài liệu không đóng gói font. Ứng dụng thật dùng Noto Sans/Noto Serif đã pin/license-check và self-host ở build.

Các màn trong prototype: trang chủ, gia phả dạng family focus, hồ sơ người, lịch giỗ và thông tin thêm. Thanh điều hướng hoạt động để đổi màn, tìm kiếm chỉ lọc fixture minh họa, không có auth/DB hoặc chức năng lưu dữ liệu. Lịch chỉ minh họa bố cục, không phải lịch âm đã chuyển đổi. Các tên/ngày/hình khối đều là demo; không gán cho dòng họ thật.

Duyệt H1 dựa trên style, readability, hierarchy, mobile navigation và cách sử dụng màu; không coi HTML này là toàn bộ 45 màn hình hoặc ứng dụng hoàn chỉnh. Agent phải triển khai đủ screen specs và toàn bộ state, không copy chỉ landing page rồi kết thúc.

`tokens.json` là theme chuẩn, không tự thay thành màu neon/gradient rực hoặc font thư pháp khó đọc. Mẫu không dùng ảnh nhà thờ giả làm tư liệu thật; khung đồ họa trừu tượng chỉ trang trí.
