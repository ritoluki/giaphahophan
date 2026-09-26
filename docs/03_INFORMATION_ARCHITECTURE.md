# 03. Kiến trúc thông tin và điều hướng

## Cấu trúc điều hướng

Desktop: logo chữ “PHAN GIA PHẢ”; mục Giới thiệu, Gia phả, Lịch giỗ & sự kiện, Tư liệu, Tin họ; nút tìm kiếm và tài khoản. Quỹ họ, Khuyến học, Địa điểm và hướng dẫn nằm trong menu “Sinh hoạt dòng họ”. Không nhét mọi module lên thanh đầu trang.

Mobile: header cao 64px, logo 2 dòng gọn và nút tài khoản. Bottom navigation 5 mục: Trang chủ, Gia phả, Tra cứu, Lịch họ, Thêm. Mục Thêm mở trang mục lục có nhóm, không phải menu lơ lửng chật. Dùng safe-area inset; padding cuối trang phải lớn hơn chiều cao bottom bar. Khi nhập form và bàn phím mở, không che nút hoặc ô lỗi.

Quản trị có shell riêng `/quan-tri`, không hiển thị các nút phá dữ liệu xen lẫn chế độ đọc. Mobile quản trị vẫn dùng được: form một cột, review diff từng trường, bảng biến thành card hoặc khu vực cuộn ngang có nhãn rõ. Merge lớn và export lớn có preview responsive; không yêu cầu desktop để hoàn thành một tác vụ thiết yếu.

## Tuyến public

`/`, `/gioi-thieu`, `/lich-su`, `/chi-ho`, `/tin-ho`, `/tin-ho/[slug]`, `/tu-lieu` và `/dia-diem` chỉ trả những projection đã xuất bản công khai. `/quyen-rieng-tu`, `/dieu-khoan`, `/tro-giup`, `/lien-he` luôn có. Public ancestor profile chỉ có khi được xuất bản rõ ràng; không mặc định công khai mọi người đã mất.

## Tuyến thành viên

`/gia-pha`, `/tra-cuu`, `/nguoi/[id]`, `/quan-he`, `/lich-ho`, `/su-kien/[id]`, `/dong-gop`, `/dong-gop/[id]`, `/thong-bao`, `/tai-khoan`, `/quy-ho`, `/khuyen-hoc`, `/tu-lieu/[id]`. ID nội bộ opaque, code hiển thị như `DEMO-P0001`. Không dùng tên/số điện thoại làm token truy cập.

## Tuyến tài khoản

`/dang-nhap`, `/xac-thuc`, `/loi-moi/[token]`, `/quen-mat-khau`, `/dat-lai-mat-khau`, `/thiet-lap-mfa`. Token không ghi vào analytics/log; callback allowlist cùng origin. Sau đăng nhập quay lại đường dẫn nội bộ đã validate; không cho open redirect.

## Tuyến quản trị

Dashboard, Người, Quan hệ, Chi họ, Duyệt đóng góp, Tư liệu/Nguồn, Nội dung, Sự kiện, Quỹ, Khuyến học, Thành viên/Quyền, Nhập/Xuất, Chất lượng dữ liệu, Nhật ký, Cài đặt, Vận hành. Mỗi mục có capability; đường URL trực tiếp phải bị từ chối nếu không có quyền.

## Hành vi URL và trạng thái

Filter/search lưu trong query string để refresh/back không mất trạng thái; không lưu query chứa PII vào hệ thống analytics. Person detail có tab `?tab=timeline|family|sources|media`. Cây dùng `root`, `mode`, `depth`, `branch` có validation; không serialise toàn bộ graph lên URL.

Các link riêng tư chia sẻ ra ngoài phải mở màn hình đăng nhập, sau đó kiểm tra quyền, không preview tên/ảnh trong OpenGraph. Trang không tồn tại và trang không có quyền xem người riêng tư dùng cùng thông báo 404 trung tính để tránh enumeration.

## Tìm kiếm điều hướng

Một ô tìm kiếm luôn dễ thấy tại Trang chủ thành viên và Gia phả. Debounce 250ms, hủy request cũ, tối thiểu 2 ký tự với search rộng; tìm exact mã hồ sơ có thể ngắn hơn. Enter mở trang kết quả đầy đủ; kết quả nhanh tối đa 8 dòng; keyboard lên/xuống/Enter/Escape, screen reader có số kết quả **được phép xem**.
