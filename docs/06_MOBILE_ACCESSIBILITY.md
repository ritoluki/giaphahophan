# 06. Mobile-first và khả năng tiếp cận

## Ma trận hỗ trợ

Thiết kế cho viewport 320, 360, 390, 412, 768, 1024, 1440px; portrait và landscape. Kiểm thử browser stable và một major trước của Safari iOS/Chrome Android ở thời điểm phát hành, cùng Chrome/Edge/Firefox desktop. Pin ma trận thực tế trong release manifest; không mặc định Playwright WebKit tương đương hoàn toàn Safari trên iPhone thật. Playwright có emulation viewport/touch/locale/timezone, nhưng vẫn cần một lượt kiểm tra thiết bị thật. [S21]

## Điều kiện không thương lượng

Không cuộn ngang toàn trang ở 320px, trừ canvas/bảng được giới hạn và gắn nhãn. Chữ body 17px; input ≥16px. Mục tiêu chạm của dự án ≥44×44px, ưu tiên 48×48px; đây là tiêu chuẩn nội bộ cao hơn mức tối thiểu 24×24px của WCAG 2.2 AA. [S19]

Không vô hiệu hóa pinch-to-zoom. Không khóa orientation. Không chặn Back của trình duyệt. Focus ring luôn thấy, thứ tự tab hợp lý, skip navigation, label thực cho input, thông báo lỗi liên kết bằng aria-describedby. Thông báo sau lưu/review dùng live region không giành focus vô cớ.

## Cây trên điện thoại

Mặc định “Gia đình gần”: người đang chọn, cha mẹ, bạn đời, con; tương đương danh sách đọc được bằng screen reader. Người dùng chủ động chọn “Mở sơ đồ” để vào canvas. Khi chưa vào chế độ tương tác, vuốt dọc vẫn cuộn trang; trong fullscreen canvas, hướng dẫn kéo/thu phóng và nút thoát rõ. Nút phóng to/thu nhỏ/định vị luôn có, không buộc pinch hoặc kéo để hoàn thành thao tác.

Tải ban đầu tối đa 120 person occurrences. Mở thêm một nhánh theo request, không mở mọi nhánh. Tính layout trong Web Worker, có hủy việc cũ. Không re-layout toàn bộ vì một notification cập nhật. Nếu layout quá thời gian hoặc thiết bị chậm, giữ danh sách tương đương và thông báo, không trang trắng. React Flow hỗ trợ keyboard/screen reader, nhưng cần Việt hóa và kiểm thử node tùy biến. [S10][S11]

## Form dài và quản trị

Chia theo phần: cơ bản, quan hệ, sự kiện, nguồn, quyền. Tiến độ không làm mất dữ liệu khi quay lại. Lỗi trường hiển thị sát trường và tóm tắt đầu form; sau submit lỗi focus vào tóm tắt, không cuộn lung tung. Nút lưu cố định có khoảng chừa nội dung/safe-area; khi bàn phím mở phải nhìn được input và lỗi.

Date entry không dùng date picker Gregorian cho ngày chưa rõ hoặc ngày âm. Có input số từng phần và nhãn; ngày/tháng không bắt buộc khi precision=year. Nhập VND dùng inputMode numeric, phân tách hàng nghìn trên UI nhưng API là integer string. Chọn nguồn có tìm kiếm server, không combobox 10.000 option tải sẵn.

## Danh sách, bộ lọc, bảng và diff

Danh sách người dùng card đọc dọc, mỗi card có tên, năm/nhãn chưa rõ, chi và quan hệ ngắn được phép xem. Filter mở bottom sheet full-height trên màn hình nhỏ, có “Áp dụng” và “Xóa bộ lọc”. Chi tiết hồ sơ có tab ít mục, phần khác dùng accordion với heading đúng cấp.

Diff review mobile xếp “Hiện tại” rồi “Đề nghị” theo từng trường; không ép hai cột rộng. Bảng tài chính chuyển card nhưng vẫn giữ số tiền, trạng thái, ngày và mã bút toán. Không loại bỏ cột quan trọng mà không có cách xem lại.

## Mạng yếu, offline và PWA

Online-first. Manifest và install hint có thể có; bản 1 **không cache hồ sơ/ảnh/API private bằng service worker**. Offline chỉ có shell hướng dẫn chung; mọi mutation cần online. Không hiển thị “Đã lưu” khi request chưa được server xác nhận.

Retry mutation sử dụng Idempotency-Key. Request tìm kiếm hủy khi query đổi. Media upload hiển thị tiến độ, hủy và retry; hạn chế file theo dung lượng trước upload và server kiểm tra lại. Session hết hạn hiển thị lựa chọn đăng nhập lại, không đưa dữ liệu form vào URL.

## Accessibility gate

WCAG 2.2 AA là mục tiêu kỹ thuật; không tuyên bố chứng nhận tự động. axe không có critical/serious violation; keyboard walkthrough hoàn thành J01–J06; VoiceOver hoặc TalkBack đọc được tìm kiếm/hồ sơ/ngày âm; zoom 200% không che nút; text spacing không cắt dấu. Cần review thủ công heading, alt, focus, thông báo và tương phản. [S18][S19]

## Performance gate

Mục tiêu field p75: LCP ≤2,5s, INP ≤200ms, CLS ≤0,1; đo riêng mobile/desktop và không coi thiếu traffic CrUX là đạt. [S20]

Lab release build: median 3 lần Lighthouse mobile Trang chủ/Giới thiệu ≥90 performance, accessibility ≥95; trang thành viên kiểm tra bằng kịch bản đăng nhập riêng. Canvas có budget tải/tương tác riêng, không bắt một điểm Lighthouse thay thế test graph.

Budget ban đầu: public route initial JS ≤200KB gzip, member non-tree ≤250KB, tree bundle lazy riêng ≤700KB gzip; LCP media ≤250KB, page payload ban đầu ≤1MB trừ file người dùng chủ động mở. Đây là budget dự án; nếu framework baseline vượt phải đo và ADR, không tự tắt tính năng đúng đắn để đạt số.

API p95 dưới 800ms với 10k người/50 concurrent trong cùng vùng; tree projection p95 dưới 1,5s; layout 120 node mobile mục tiêu dưới 1s trên thiết bị tham chiếu. Ghi rõ CPU throttle, băng thông, latency, DB plan và dữ liệu. Không quảng cáo những con số này như số đo đã đạt.
