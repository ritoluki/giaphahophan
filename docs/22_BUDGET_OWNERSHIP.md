# 22. Ngân sách, quyền sở hữu và quyết định cần duyệt

## Những con số đã tra cứu

Theo trang giá tại thời điểm tra cứu 26/09/2026: Supabase Pro từ 25 USD/tháng; ví dụ một organization có hai Micro projects có tổng nền 35 USD/tháng theo mô hình compute/credit được nhà cung cấp mô tả. [S23] Railway Hobby minimum usage 5 USD, Pro minimum usage 20 USD, có usage credit và phần tài nguyên phát sinh; không cộng minimum lần nữa khi đã tính tổng usage theo chính sách. [S27] Resend Free 3.000 email/tháng và 100/ngày; gói Pro 50.000 từ 20 USD/tháng. [S28]

Không coi các gói free là cam kết luôn đủ, không coi quota là hiệu năng hoặc SLA. Giá, thuế, quota và chính sách có thể đổi; H2 agent phải mở lại trang giá và lập dự toán theo cấu hình thực trước khi chủ dự án thanh toán.

## Dự trù của dự án, không phải báo giá nhà cung cấp

| Hạng mục | Dự trù USD/tháng | Ghi chú |
|---|---|---|
| Supabase production + staging Micro | Khoảng 35 ở cấu hình nền đã tham khảo | Compute/storage/egress vượt quota cộng thêm |
| Railway web + worker + scan/dịch vụ hỗ trợ | 20–45 | Giả định usage nhỏ-vừa, đã tính minimum plan phù hợp; phải benchmark CPU/RAM |
| Email | 0–20 | Chọn theo số người nhận, burst ngày giỗ và quota |
| Backup object storage + monitoring | 5–20 dự phòng | Không phải mức giá cố định R2; phụ thuộc lưu lượng/retention [S25] |
| Tổng tham chiếu | 60–120 | Chưa VAT, domain, PITR, dịch vụ chuyên môn hoặc traffic lớn |

Không quy đổi VND bằng tỷ giá đoán. Domain mua theo tên/nhà đăng ký cụ thể sau H2. Phí coding agent/model không nằm trong hạ tầng website. Chi phí thấp hơn có thể bằng staging local/gói nhỏ hơn nhưng mất sự thuận tiện hoặc năng lực; không tự hạ cấu hình để hứa con số rẻ.

## Kiểm soát phát sinh

Budget warning 50/75/90%, hard cap nơi provider hỗ trợ và phù hợp availability. Một cảnh báo ngân sách không bảo đảm chặn toàn bộ hóa đơn; owner cần hiểu giới hạn của cap từng dịch vụ. Upload quota, image derivatives, export concurrency, email recipient cap và retention ngăn chi phí tăng không kiểm soát.

PITR, map provider, SMS, Zalo, AI/OCR cloud, video transcoding và thanh toán online cần approval riêng; không nằm mặc định. Không tự mở trial cần thẻ rồi để tự chuyển trả phí.

## Quyền sở hữu và bàn giao

Repo thuộc owner; domain thuộc owner; cloud subscription/billing thuộc owner; source license và third-party license có inventory; assets/ảnh/tài liệu được gia đình cho phép; backup keys/recovery thuộc owner. Agent bàn giao manifest dịch vụ, cách truy cập, quyền tối thiểu và tài liệu khôi phục, không đưa secret vào Word/Markdown.

## Các quyết định chưa thể tự biết

Tên chi/quê quán/thủy tổ; dữ liệu thực/số lượng; người giữ gia phả và người duyệt; quy ước giỗ; phạm vi công khai/consent; region hợp lệ; ngân sách/domain và provider account. Tất cả có default demo và gate rõ để agent không phải hỏi vụn vặt từ đầu.
