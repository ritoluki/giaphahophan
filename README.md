# PHAN GIA PHẢ — Bộ hồ sơ triển khai end-to-end

**Phiên bản:** 1.0 • **Ngày lập:** 26/09/2026 • **Ngôn ngữ:** Tiếng Việt • **Trạng thái:** Đặc tả để triển khai, chưa phải ứng dụng đã xây dựng.

Mục tiêu: xây dựng một website gia phả họ Phan đầy đủ, trang nghiêm, dễ sử dụng trên điện thoại, có quy trình nhập liệu có nguồn, cộng tác có duyệt, bảo vệ dữ liệu và vận hành lâu dài. Chủ dự án duyệt những quyết định quan trọng; agent chủ động thiết kế, lập trình, kiểm thử và chuẩn bị phát hành.

## Đọc và bắt đầu

1. Chủ dự án đọc `OWNER_HANDBOOK.docx` và mở `design/preview.html` bằng trình duyệt. HTML chỉ là mẫu phong cách và một số tương tác minh họa; không phải ứng dụng hoặc bản thiết kế đầy đủ mọi màn hình.
2. Giải nén toàn bộ thư mục vào repo mới, ví dụ `C:\phan-gia-pha`. Không đặt trong repo ngân hàng hoặc repo có dữ liệu công việc.
3. Mở thư mục bằng VS Code; giao cho coding agent nội dung `prompts/START-CODEX.txt`.
4. Agent đọc `AGENTS.md`, `START_HERE.md`, rồi triển khai theo `state/TASKS.json`. Không cần chủ dự án lần lượt gửi lại từng tài liệu.
5. Những lần sau dùng `prompts/CONTINUE.txt`. Không cần bắt đầu lại khi đổi phiên chat.

## Những gì có trong bộ hồ sơ

| Nhóm | Nội dung |
|---|---|
| Điều hành agent | Quyền tự quyết, thứ tự đọc, quy tắc bằng chứng, prompt khởi động/tiếp tục/audit/import/deploy, trạng thái và bàn giao |
| Sản phẩm | Phạm vi bản đầy đủ, vai trò, luồng nghiệp vụ, danh mục màn hình, tiêu chí nghiệm thu |
| Thiết kế | Màu, chữ, khoảng cách, component, mobile, accessibility, bản xem thử responsive |
| Kỹ thuật | Kiến trúc, mô hình quan hệ gia phả, dữ liệu, API, auth, quyền, lịch âm, worker, import/export |
| Chất lượng | Test matrix, traceability, dữ liệu minh họa, dữ liệu kiểm thử rìa, kiểm thử tải, bảo mật |
| Production | Windows/local, CI/CD, staging, domain, email, sao lưu cả DB và file, phục hồi, sự cố, chi phí và bàn giao |

## Các quyết định mặc định

- Một website cho **một dòng/chi họ Phan cụ thể**, có nhiều chi/nhánh. Chưa xác định quê quán, thủy tổ hoặc năm lập họ; tuyệt đối không bịa thành lịch sử thật.
- Xây bản đầy đủ theo các chặng phụ thuộc; **không coi bản cây demo hoặc landing page là sản phẩm hoàn thành**.
- Next.js 16.3.x đã được kiểm chứng là một nhánh phát hành; chọn bản vá an toàn tương thích tại P0. Node.js 24 LTS; React theo peer dependency của Next. Không ghi `latest` vào manifest/lockfile đã chốt. [S04][S05]
- Supabase PostgreSQL/Auth/Storage; SQL-first, không thêm ORM chỉ để có thêm một lớp. Web BFF và worker Node.js triển khai dạng container; Railway là phương án mặc định sau khi chủ dự án duyệt chi phí/vùng lưu trữ.
- Giao diện giấy ngà, đỏ trầm, vàng đồng tiết chế; Noto Sans cho giao diện và Noto Serif cho tiêu đề. Không đóng gói file font trong bộ tài liệu này.
- Dữ liệu demo hư cấu, có nhãn ở mọi môi trường demo. Dữ liệu thật chỉ được đưa vào sau quy trình duyệt và quyền riêng tư.

## Phân biệt trạng thái

`PASS` chỉ dùng khi có lệnh thực sự chạy, mã thoát, log và phạm vi kiểm thử. `NOT_RUN` không phải PASS. Báo cáo `PACKAGE_VALIDATION.json` nếu có chỉ kiểm tra tính nhất quán bộ tài liệu/fixture và mẫu HTML; **không chứng minh website đã chạy, đã bảo mật hoặc đã lên production**.

Tham khảo có nguồn trong `docs/25_SOURCES.md`. Các chỉ tiêu tải, chi phí dự trù, tổ chức dữ liệu và thiết kế là quyết định/giả định của dự án, không phải bảo đảm của nhà cung cấp.
