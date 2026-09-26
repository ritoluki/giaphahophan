# 04. Đặc tả màn hình chi tiết


Các route dưới đây là tuyến giao diện. API canonical trong OpenAPI, ánh xạ qua module. Mọi màn hình phải có loading/empty/error/restricted, dữ liệu dài và 320px; trạng thái nào không áp dụng cần lý do trong test. Không coi prototype HTML là đủ triển khai 45 màn hình.


## SCR-01 — Trang chủ

**Route:** `/`. **Đối tượng:** Public/member. **Module:** M01.

**Nội dung và trường:** Hero; tìm kiếm; lịch tới; tin đã duyệt; footer.

**Tương tác:** Tìm người; xem gia phả; mở lịch; đọc tin.

**Quy tắc/validation:** Không đưa count/tên/ảnh private vào public HTML.

**Mobile:** Một cột, search ngay sau hero, bottom nav có safe-area.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M01-01, REQ-M01-02, REQ-M01-03, REQ-M01-04.


## SCR-02 — Lịch sử dòng họ

**Route:** `/lich-su`. **Đối tượng:** Public/member. **Module:** M02.

**Nội dung và trường:** Phả ký; timeline; nguồn; mức xác minh.

**Tương tác:** Đọc theo mốc; mở citation; xem chi.

**Quy tắc/validation:** Khoảng năm và nội dung chưa xác minh phải có nhãn.

**Mobile:** Timeline dọc, body 17px, không cắt dấu.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M02-01, REQ-M02-02, REQ-M02-03, REQ-M02-04.


## SCR-03 — Danh mục chi

**Route:** `/chi-ho`. **Đối tượng:** Public/member. **Module:** M02.

**Nội dung và trường:** Tên/mã chi; nguồn; founder được xem; mô tả.

**Tương tác:** Lọc chi; mở chi; xem cây root.

**Quy tắc/validation:** Chưa biết founder để trống, không nối giả.

**Mobile:** Card có nhãn rõ và nút ≥44px.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M02-01, REQ-M02-02, REQ-M02-03, REQ-M02-04.


## SCR-04 — Tra cứu người

**Route:** `/tra-cuu`. **Đối tượng:** Member. **Module:** M06.

**Nội dung và trường:** Query; chi; khoảng năm; đời theo root; result cards.

**Tương tác:** Tìm; lọc; bỏ lọc; mở đúng hồ sơ.

**Quy tắc/validation:** Tên trùng có code/chi/year context; counts theo quyền.

**Mobile:** Filter sheet, giữ state khi Back, keyboard search.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M06-01, REQ-M06-02, REQ-M06-03, REQ-M06-04.


## SCR-05 — Cây gia phả

**Route:** `/gia-pha`. **Đối tượng:** Member. **Module:** M04.

**Nội dung và trường:** Root; mode; depth; nodes/edges; legend; cap.

**Tương tác:** Expand; collapse; zoom; focus; đổi root; mở profile.

**Quy tắc/validation:** Cap/truncation/disputed rõ; không kéo để sửa quan hệ.

**Mobile:** Family focus mặc định, fullscreen tree tùy chọn, luôn có thoát.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M04-01, REQ-M04-02, REQ-M04-03, REQ-M04-04, REQ-M04-05, REQ-M04-06.


## SCR-06 — Hồ sơ người

**Route:** `/nguoi/[id]`. **Đối tượng:** Member/curated public. **Module:** M03.

**Nội dung và trường:** Tên/alias; ngày; family; facts; sources; media.

**Tương tác:** Đổi tab; xem tree; đề nghị sửa; bookmark local preference.

**Quy tắc/validation:** Unknown/date precision/field redaction đúng ở payload.

**Mobile:** Tên dài xuống dòng, tabs/accordion, CTA không che nội dung.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M03-01, REQ-M03-02, REQ-M03-03, REQ-M03-04, REQ-M03-05, REQ-M03-06.


## SCR-07 — Tra quan hệ

**Route:** `/quan-he`. **Đối tượng:** Member. **Module:** M05.

**Nội dung và trường:** Người A/B; loại đường; path; hạn mức.

**Tương tác:** Chọn người; đổi A/B; tính đường; xem từng node.

**Quy tắc/validation:** Không đi qua node ẩn, không suy chắc xưng hô.

**Mobile:** Hai combobox dọc, path dạng step cards.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M05-01, REQ-M05-02, REQ-M05-03, REQ-M05-04.


## SCR-08 — Đăng nhập

**Route:** `/dang-nhap`. **Đối tượng:** Visitor. **Module:** M07.

**Nội dung và trường:** Email; password; lỗi chung; link recovery.

**Tương tác:** Đăng nhập; hiện/ẩn password; quên mật khẩu.

**Quy tắc/validation:** Không enumeration/open redirect; rate limit có hướng dẫn.

**Mobile:** Input 16px, bàn phím không che submit.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M07-01, REQ-M07-02, REQ-M07-03, REQ-M07-04, REQ-M07-05.


## SCR-09 — Nhận lời mời

**Route:** `/loi-moi/[token]`. **Đối tượng:** Invited. **Module:** M07.

**Nội dung và trường:** Thông tin mời đã redacted; email; terms.

**Tương tác:** Xác nhận; đăng nhập/đặt password.

**Quy tắc/validation:** Token hết hạn/đã dùng không cấp quyền; đúng email.

**Mobile:** Một luồng rõ, không wizard dài không cần thiết.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M07-01, REQ-M07-02, REQ-M07-03, REQ-M07-04, REQ-M07-05.


## SCR-10 — Phục hồi tài khoản

**Route:** `/quen-mat-khau`. **Đối tượng:** Visitor. **Module:** M07.

**Nội dung và trường:** Email; trạng thái gửi; callback reset.

**Tương tác:** Gửi yêu cầu; nhập password mới.

**Quy tắc/validation:** Câu trả lời giống nhau dù email tồn tại hay không.

**Mobile:** Hiển thị hướng dẫn tiếng Việt, không countdown gây áp lực.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M07-01, REQ-M07-02, REQ-M07-03, REQ-M07-04, REQ-M07-05.


## SCR-11 — Thiết lập xác thực bổ sung

**Route:** `/thiet-lap-mfa`. **Đối tượng:** Privileged. **Module:** M07.

**Nội dung và trường:** Factor; QR secret riêng; code; recovery instructions.

**Tương tác:** Enroll; verify; remove theo policy.

**Quy tắc/validation:** Không log/screenshot secret trong báo cáo; remove không bypass đặc quyền.

**Mobile:** OTP input paste được; QR có alternative an toàn.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M07-01, REQ-M07-02, REQ-M07-03, REQ-M07-04, REQ-M07-05.


## SCR-12 — Tài khoản và tùy chọn

**Route:** `/tai-khoan`. **Đối tượng:** Member. **Module:** M07.

**Nội dung và trường:** Tên account; linked person; notification prefs; sessions.

**Tương tác:** Đề nghị claim; đổi password; đăng xuất; chỉnh tùy chọn.

**Quy tắc/validation:** Claim không tự duyệt; revoke phiên có hiệu lực.

**Mobile:** Form nhóm nhỏ, action rõ trạng thái đang lưu.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M07-01, REQ-M07-02, REQ-M07-03, REQ-M07-04, REQ-M07-05.


## SCR-13 — Lịch giỗ và sinh hoạt

**Route:** `/lich-ho`. **Đối tượng:** Member. **Module:** M10.

**Nội dung và trường:** Agenda; tháng; âm/dương; filter chi; event cards.

**Tương tác:** Đổi tháng; chọn ngày; lọc; mở event.

**Quy tắc/validation:** Nhãn lunar/solar và năm rõ, chưa review không gửi auto.

**Mobile:** Agenda mặc định, calendar grid chạm được.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M10-01, REQ-M10-02, REQ-M10-03, REQ-M10-04, REQ-M10-05, REQ-M10-06.


## SCR-14 — Chi tiết sự kiện

**Route:** `/su-kien/[id]`. **Đối tượng:** Member. **Module:** M10.

**Nội dung và trường:** Ngày gốc; lần tổ chức; rule; địa điểm; RSVP.

**Tương tác:** RSVP; tải ICS; theo dõi; xem nguồn.

**Quy tắc/validation:** Không lộ danh sách tham dự; date override có lý do.

**Mobile:** CTA RSVP dễ chạm, địa điểm link ngoài chủ động.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M10-01, REQ-M10-02, REQ-M10-03, REQ-M10-04, REQ-M10-05, REQ-M10-06.


## SCR-15 — Thư viện

**Route:** `/tu-lieu`. **Đối tượng:** Public/member scoped. **Module:** M09.

**Nội dung và trường:** Search; album; MIME; preview; nguồn; quyền.

**Tương tác:** Lọc; mở viewer; gửi upload nếu có quyền.

**Quy tắc/validation:** Không query/list private object paths; chỉ ready items.

**Mobile:** Grid 2 cột hoặc list, thumbnails lazy.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M09-01, REQ-M09-02, REQ-M09-03, REQ-M09-04, REQ-M09-05.


## SCR-16 — Trình xem tư liệu

**Route:** `/tu-lieu/[id]`. **Đối tượng:** Scoped. **Module:** M09.

**Nội dung và trường:** Preview; page/time; caption; source; rights.

**Tương tác:** Zoom/page; tải theo quyền; gắn citation.

**Quy tắc/validation:** No active PDF script, signed URL expiry có retry authorize.

**Mobile:** Full-width viewer, controls không che trang, download fallback.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M09-01, REQ-M09-02, REQ-M09-03, REQ-M09-04, REQ-M09-05.


## SCR-17 — Nguồn và trích dẫn

**Route:** `/nguon/[id]`. **Đối tượng:** Scoped. **Module:** M09.

**Nội dung và trường:** Provider; loại; original; citation list; confidence.

**Tương tác:** Mở trang; tạo citation; đề nghị sửa.

**Quy tắc/validation:** Quyền source độc lập person/content, không tiết lộ quote private.

**Mobile:** Thông tin nhãn-giá trị dọc, crop locator dễ tìm.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M09-01, REQ-M09-02, REQ-M09-03, REQ-M09-04, REQ-M09-05.


## SCR-18 — Tin họ

**Route:** `/tin-ho`. **Đối tượng:** Public/member. **Module:** M12.

**Nội dung và trường:** Category; bài published; dates; cover.

**Tương tác:** Lọc; đọc; phân trang.

**Quy tắc/validation:** Không draft metadata/ảnh vào public.

**Mobile:** Card editorial, không masonry khó theo thứ tự.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M12-01, REQ-M12-02, REQ-M12-03, REQ-M12-04.


## SCR-19 — Bài viết

**Route:** `/tin-ho/[slug]`. **Đối tượng:** Public/member. **Module:** M12.

**Nội dung và trường:** Title; intro; rich text; source; photos.

**Tương tác:** Đọc; xem source; share public only.

**Quy tắc/validation:** Slug/OG không lộ private; media policy riêng.

**Mobile:** Dòng 60–68 ký tự, ảnh không gây CLS.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M12-01, REQ-M12-02, REQ-M12-03, REQ-M12-04.


## SCR-20 — Nhà thờ và địa điểm

**Route:** `/dia-diem`. **Đối tượng:** Scoped. **Module:** M13.

**Nội dung và trường:** Loại; tên; địa chỉ được phép; ảnh.

**Tương tác:** Lọc; mở detail; map explicit.

**Quy tắc/validation:** Không auto geocode/toạ độ private.

**Mobile:** List-first thay map toàn màn hình.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M13-01, REQ-M13-02, REQ-M13-03, REQ-M13-04.


## SCR-21 — Địa điểm chi tiết

**Route:** `/dia-diem/[id]`. **Đối tượng:** Scoped. **Module:** M13.

**Nội dung và trường:** Thông tin; nguồn; photos; locator; hướng dẫn.

**Tương tác:** Mở bản đồ ngoài; xem tư liệu.

**Quy tắc/validation:** Không giả địa danh demo có thật; tọa độ theo quyền.

**Mobile:** CTA maps có nhắc mở dịch vụ ngoài.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M13-01, REQ-M13-02, REQ-M13-03, REQ-M13-04.


## SCR-22 — Minh bạch quỹ

**Route:** `/quy-ho`. **Đối tượng:** Member scoped. **Module:** M14.

**Nội dung và trường:** Kỳ; quỹ; thu/chi; số dư; report approved.

**Tương tác:** Đổi kỳ; xem report; tải projection.

**Quy tắc/validation:** Donor/proof không lộ; không gọi số dư là bank sync.

**Mobile:** Summary cards và entry cards, số tiền không tràn.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M14-01, REQ-M14-02, REQ-M14-03, REQ-M14-04, REQ-M14-05.


## SCR-23 — Khuyến học

**Route:** `/khuyen-hoc`. **Đối tượng:** Scoped. **Module:** M15.

**Nội dung và trường:** Program; criteria; hạn; approved stories.

**Tương tác:** Xem chương trình; đề cử; theo dõi.

**Quy tắc/validation:** Ứng viên/chứng từ trẻ em riêng tư.

**Mobile:** Form một cột, giải thích dữ liệu cần thu.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M15-01, REQ-M15-02, REQ-M15-03, REQ-M15-04.


## SCR-24 — Gửi bổ sung

**Route:** `/dong-gop/moi`. **Đối tượng:** Member. **Module:** M08.

**Nội dung và trường:** Loại change; người; field changes; sources; reason.

**Tương tác:** Save draft; preview; submit.

**Quy tắc/validation:** Không cập nhật canonical trước duyệt; schema/rights validated.

**Mobile:** Step sections và draft indicator, mất mạng không báo thành công.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M08-01, REQ-M08-02, REQ-M08-03, REQ-M08-04, REQ-M08-05.


## SCR-25 — Theo dõi đề nghị

**Route:** `/dong-gop/[id]`. **Đối tượng:** Author/reviewer. **Module:** M08.

**Nội dung và trường:** Status; diff; review notes; history.

**Tương tác:** Bổ sung; rút; xem decision.

**Quy tắc/validation:** Chỉ actor có quyền; current/base conflict rõ.

**Mobile:** Diff dọc theo từng trường, CTA theo state.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M08-01, REQ-M08-02, REQ-M08-03, REQ-M08-04, REQ-M08-05.


## SCR-26 — Hộp thông báo

**Route:** `/thong-bao`. **Đối tượng:** Member. **Module:** M11.

**Nội dung và trường:** Unread; event/proposal summaries; prefs.

**Tương tác:** Mark read; mở link; sửa prefs.

**Quy tắc/validation:** Revoked resource không lộ tên cũ trong notification.

**Mobile:** List có timestamp dễ đọc, badge không chỉ màu.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M11-01, REQ-M11-02, REQ-M11-03, REQ-M11-04.


## SCR-27 — Tổng quan quản trị

**Route:** `/quan-tri`. **Đối tượng:** Granted admin. **Module:** M17.

**Nội dung và trường:** Pending review; quality; failed jobs; scope.

**Tương tác:** Đi tới hàng đợi; xem ops nếu có grant.

**Quy tắc/validation:** Không đưa private counts cho role thiếu quyền.

**Mobile:** Dashboard chọn lọc, không 12 chart nhỏ.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M17-01, REQ-M17-02, REQ-M17-03, REQ-M17-04, REQ-M17-05.


## SCR-28 — Biên tập người

**Route:** `/quan-tri/nguoi/[id]`. **Đối tượng:** Editor scope. **Module:** M03.

**Nội dung và trường:** Names; dates; branch; facts; privacy; sources.

**Tương tác:** Draft; preview; submit; soft-delete request.

**Quy tắc/validation:** If-Match; không self-publish sensitive; required fields đúng precision.

**Mobile:** Form sections, error summary và focus, sticky save có padding.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M03-01, REQ-M03-02, REQ-M03-03, REQ-M03-04, REQ-M03-05, REQ-M03-06.


## SCR-29 — Biên tập quan hệ

**Route:** `/quan-tri/quan-he`. **Đối tượng:** Editor scope. **Module:** M04.

**Nội dung và trường:** Parent/child; kind/status; union; source.

**Tương tác:** Preview impact; submit edge change.

**Quy tắc/validation:** Self/cycle/cross-tree rejected, không đoán parent từ union.

**Mobile:** Chọn 2 người bằng search, confirm text rõ trước submit.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M04-01, REQ-M04-02, REQ-M04-03, REQ-M04-04, REQ-M04-05, REQ-M04-06.


## SCR-30 — Duyệt đề nghị

**Route:** `/quan-tri/duyet/[id]`. **Đối tượng:** Reviewer scope. **Module:** M08.

**Nội dung và trường:** Base/current/proposed; sources; impact.

**Tương tác:** Approve; reject; needs info; rebase.

**Quy tắc/validation:** 2-person và branch scope; atomic apply; stale 409.

**Mobile:** Diff dọc, nút nguy hiểm tách, không duyệt nhầm khi scroll.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M08-01, REQ-M08-02, REQ-M08-03, REQ-M08-04, REQ-M08-05.


## SCR-31 — Gộp hồ sơ

**Route:** `/quan-tri/gop-ho-so`. **Đối tượng:** Merge grant+MFA. **Module:** M17.

**Nội dung và trường:** Candidate A/B; survivor; all references; conflicts.

**Tương tác:** Preview; request second review; apply.

**Quy tắc/validation:** Version/cycle/userlink/privacy/finance kiểm tra; manifest.

**Mobile:** Hai hồ sơ xếp dọc mobile, confirmation typed code.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M17-01, REQ-M17-02, REQ-M17-03, REQ-M17-04, REQ-M17-05.


## SCR-32 — Nhập tài liệu

**Route:** `/quan-tri/nhap-lieu`. **Đối tượng:** Import grant. **Module:** M16.

**Nội dung và trường:** File; target tree; mapping; rows; warnings; dry-run.

**Tương tác:** Upload; map; exclude; approve; apply; cancel.

**Quy tắc/validation:** File hash/approval hash; idempotency; partial states đúng.

**Mobile:** Stepper rõ, row error cards, không cần desktop để review.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M16-01, REQ-M16-02, REQ-M16-03, REQ-M16-04, REQ-M16-05, REQ-M16-06.


## SCR-33 — Xuất gia phả

**Route:** `/quan-tri/xuat-lieu`. **Đối tượng:** Export grant+MFA. **Module:** M16.

**Nội dung và trường:** Format; scope; privacy; warnings; job.

**Tương tác:** Preview redaction; request; cancel; download.

**Quy tắc/validation:** Re-authorize create/run/download; expiry; CSV injection.

**Mobile:** Scope selection gọn, progress/counters trung thực.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M16-01, REQ-M16-02, REQ-M16-03, REQ-M16-04, REQ-M16-05, REQ-M16-06.


## SCR-34 — Thành viên và quyền

**Route:** `/quan-tri/thanh-vien`. **Đối tượng:** Admin/owner. **Module:** M07.

**Nội dung và trường:** Membership; status; branch grants; MFA state.

**Tương tác:** Invite; suspend; revoke; change role.

**Quy tắc/validation:** No self-promote/last owner removal; grant audit.

**Mobile:** Cards + filter, confirm từng change quyền.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M07-01, REQ-M07-02, REQ-M07-03, REQ-M07-04, REQ-M07-05.


## SCR-35 — Biên tập nội dung

**Route:** `/quan-tri/noi-dung`. **Đối tượng:** Content grant. **Module:** M12.

**Nội dung và trường:** Rich text; revisions; slug; sources; schedule.

**Tương tác:** Preview; submit; publish; archive.

**Quy tắc/validation:** Sanitize; published snapshot khác draft; no private OG.

**Mobile:** Toolbar accessible, không HTML editor thô mặc định.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M12-01, REQ-M12-02, REQ-M12-03, REQ-M12-04.


## SCR-36 — Quy tắc ngày giỗ

**Route:** `/quan-tri/su-kien`. **Đối tượng:** Event editor. **Module:** M10.

**Nội dung và trường:** Source date; leap/short-month policy; preview 3 lần.

**Tương tác:** Validate; request review; override; cancel.

**Quy tắc/validation:** Unknown/leap needs review; occurrence version/dedupe.

**Mobile:** Date parts rõ, policy có ví dụ, không picker dương duy nhất.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M10-01, REQ-M10-02, REQ-M10-03, REQ-M10-04, REQ-M10-05, REQ-M10-06.


## SCR-37 — Quản trị sổ quỹ

**Route:** `/quan-tri/quy-ho`. **Đối tượng:** Treasury grants. **Module:** M14.

**Nội dung và trường:** Fund; journal; proof; period; balanced preview.

**Tương tác:** Draft; submit; approve; reverse; lock period.

**Quy tắc/validation:** Integer VND, 2-person, immutability, idempotency.

**Mobile:** Thu/chi form dễ hiểu, không bắt nhập debit credit thô.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M14-01, REQ-M14-02, REQ-M14-03, REQ-M14-04, REQ-M14-05.


## SCR-38 — Duyệt hỗ trợ

**Route:** `/quan-tri/khuyen-hoc`. **Đối tượng:** Scholarship grant. **Module:** M15.

**Nội dung và trường:** Program; applicant private; evidence; award.

**Tương tác:** Review; approve; link payment; withdraw.

**Quy tắc/validation:** No public minors, paid chỉ khi journal posted.

**Mobile:** Evidence viewer + decisions tách rõ.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M15-01, REQ-M15-02, REQ-M15-03, REQ-M15-04.


## SCR-39 — Nhật ký thay đổi

**Route:** `/quan-tri/nhat-ky`. **Đối tượng:** Audit grant. **Module:** M17.

**Nội dung và trường:** Actor pseudonymous; action; resource; version; reason.

**Tương tác:** Filter; xem chi tiết allowed; export scoped.

**Quy tắc/validation:** Không log PII vô hạn hoặc token; pagination.

**Mobile:** Timeline/cards, filter sheet.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M17-01, REQ-M17-02, REQ-M17-03, REQ-M17-04, REQ-M17-05.


## SCR-40 — Thiết lập và vận hành

**Route:** `/quan-tri/cai-dat`. **Đối tượng:** Owner/granted. **Module:** M18.

**Nội dung và trường:** Policy; scopes; jobs; backup age; config names.

**Tương tác:** Update reviewed settings; retry safe; view health.

**Quy tắc/validation:** Không lộ secrets; ops action audit/MFA; không restore prod tự động.

**Mobile:** Tabs theo nhóm, warnings và confirm rõ.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M18-01, REQ-M18-02, REQ-M18-03, REQ-M18-04, REQ-M18-05, REQ-M18-06.


## SCR-41 — Chính sách và yêu cầu dữ liệu

**Route:** `/quyen-rieng-tu`. **Đối tượng:** Public. **Module:** M17.

**Nội dung và trường:** Mục đích; audience; retention; contact; request.

**Tương tác:** Gửi yêu cầu quyền dữ liệu theo cơ chế xác minh.

**Quy tắc/validation:** Không tự khẳng định compliance, owner hoàn thiện trước real.

**Mobile:** Bài đọc rõ, form tối thiểu dữ liệu.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M17-01, REQ-M17-02, REQ-M17-03, REQ-M17-04, REQ-M17-05.


## SCR-42 — Mục lục mobile

**Route:** `/them`. **Đối tượng:** Public/member. **Module:** M01.

**Nội dung và trường:** Các nhóm nội dung; tài khoản; trợ giúp.

**Tương tác:** Đi tới module; đăng xuất.

**Quy tắc/validation:** Ẩn module thiếu capability nhưng server vẫn deny.

**Mobile:** Targets 48px, nhóm có heading, bottom nav selected.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M01-01, REQ-M01-02, REQ-M01-03, REQ-M01-04.


## SCR-43 — Chi tiết chi

**Route:** `/chi-ho/[id]`. **Đối tượng:** Scoped. **Module:** M02.

**Nội dung và trường:** Founder được xem; phả ký; root; sources; members scoped.

**Tương tác:** Xem cây; lọc người; đọc nguồn.

**Quy tắc/validation:** Không cho branch membership mở rộng quyền ngầm.

**Mobile:** Header gọn và list-first.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M02-01, REQ-M02-02, REQ-M02-03, REQ-M02-04.


## SCR-44 — Chất lượng dữ liệu

**Route:** `/quan-tri/chat-luong`. **Đối tượng:** Reviewer/admin. **Module:** M17.

**Nội dung và trường:** Missing sources; duplicates; conflicts; disconnected roots.

**Tương tác:** Assign; review; dismiss reason; open merge.

**Quy tắc/validation:** Không tự merge hoặc đoán dữ liệu để đạt 100%.

**Mobile:** Filter status + issue cards có next action.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M17-01, REQ-M17-02, REQ-M17-03, REQ-M17-04, REQ-M17-05.


## SCR-45 — Mộ phần

**Route:** `/mo-phan/[id]`. **Đối tượng:** Scoped. **Module:** M13.

**Nội dung và trường:** Person; place; khu/lô; ảnh; nguồn; visibility.

**Tương tác:** Xem locator; đề nghị sửa; mở direction.

**Quy tắc/validation:** Locator/tọa độ/source restricted có kiểm tra riêng.

**Mobile:** Thông tin dọc, không auto mở bản đồ ngoài.

**Trạng thái:** skeleton giữ bố cục; empty có hành động phù hợp quyền; lỗi có request ID/retry an toàn; restricted không lộ giá trị; tên dài/zoom 200% không cắt; mutation có pending/success/error/conflict đúng nghĩa.

**Nghiệm thu:** thao tác bằng chuột, chạm và bàn phím; refresh/Back giữ state hợp lý; API/DB chặn thao tác không được phép kể cả gọi trực tiếp; kiểm tra các requirement liên quan bên dưới.

**Trace:** REQ-M13-01, REQ-M13-02, REQ-M13-03, REQ-M13-04.

