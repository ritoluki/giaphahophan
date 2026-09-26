# 01. Tầm nhìn và phạm vi sản phẩm

## Tầm nhìn

Phan Gia Phả là kho ký ức và hệ thống tra cứu quan hệ của một dòng/chi họ Phan, giúp các thế hệ biết mình thuộc nhánh nào, biết ngày tưởng nhớ tổ tiên và cùng gìn giữ tư liệu có nguồn. Không phải mạng xã hội công khai, công cụ phán định huyết thống hoặc website đại diện mặc nhiên cho mọi người họ Phan.

Website phải đủ đẹp để dùng trong sinh hoạt dòng họ, đủ rõ cho người lớn tuổi và đủ chặt để lưu dữ liệu hàng chục năm. “Làm lớn ngay” được hiểu là thiết kế đầy đủ domain, quyền, nội dung, vận hành và đường mở rộng ngay từ đầu; việc thực thi vẫn theo chặng có kiểm chứng.

## Đối tượng

| Nhóm | Nhu cầu ưu tiên | Rủi ro phải xử lý |
|---|---|---|
| Người lớn tuổi | Tìm tên, đọc chữ rõ, xem con cháu, ngày giỗ | Chữ nhỏ, quá nhiều thao tác, mất phương hướng trong cây |
| Thành viên dùng điện thoại | Tra quan hệ, xem sự kiện, gửi bổ sung | Mạng yếu, khó chọn node, bàn phím che nút lưu |
| Người giữ gia phả | Ghi nguồn, đối chiếu, xử lý thông tin mâu thuẫn | Trùng tên, nhập sai quan hệ, thay đổi không truy vết |
| Người duyệt từng chi | Duyệt nội dung thuộc phạm vi được giao | Tự duyệt sai, vượt quyền sang chi khác |
| Thủ quỹ / người kiểm soát | Ghi thu–chi và công khai đúng mức | Chỉnh sổ cũ, lộ danh sách đóng góp, nhầm số tiền |
| Khách chưa đăng nhập | Đọc lịch sử và nội dung đã cho phép công khai | Tưởng dữ liệu demo là thật, truy ra người sống |
| Chủ dự án | Duyệt thiết kế, ngân sách, dữ liệu và release | Agent báo xong thiếu bằng chứng; phụ thuộc nhà phát triển |

## Phạm vi bản 1 đầy đủ

Toàn bộ module M01–M18 trong docs 02 là phạm vi nghiệm thu bản 1. Chỉ AI tự động, thanh toán online, DNA, ứng dụng native và nền tảng nhiều dòng họ thương mại nằm ngoài phạm vi. Không được tự đẩy module bản 1 sang “giai đoạn sau” chỉ để báo hoàn thành.

## Giả định quy mô cần kiểm thử

Đây là **mục tiêu thiết kế**, không phải số liệu thực của họ Phan: 10.000 hồ sơ/người, 30.000 cạnh quan hệ, 100 tài khoản dùng thường xuyên, 50 phiên đồng thời, 20GB tư liệu ban đầu. Có bộ stress 50.000 người để phát hiện điểm nghẽn, nhưng không cam kết toàn bộ đồ thị được render cùng lúc.

Mỗi viewport cây tối đa 120 người trên mobile, 300 trên desktop; danh sách có cursor, server trả theo quyền. Hệ thống phải giữ responsive khi mở một nhánh lớn bằng cách tải cục bộ, không gửi cả cơ sở dữ liệu xuống browser.

## Kết quả cần đạt

Tìm một người và mở đúng hồ sơ trong tối đa 3 thao tác từ trang chủ sau đăng nhập; xem ngày giỗ sắp tới trong 2 thao tác; đề nghị sửa có số theo dõi; mọi dữ liệu xuất bản có người chịu trách nhiệm; phục hồi được cả hồ sơ và tư liệu từ bản sao lưu.

Số đo trải nghiệm và tải phải có baseline, thiết bị và bản build. Không dùng “cảm thấy mượt” hoặc một điểm Lighthouse đẹp để thay thế toàn bộ nghiệm thu.

## Không bịa lịch sử

Tên chi, tổ tiên, niên đại, quê quán, truyền thống, quy ước và câu đối là nội dung do gia đình xác minh. Trước khi có tư liệu, chỉ dùng câu giới thiệu chung và nhãn minh họa. Không lấy thông tin của một chi Phan trên internet gắn vào chi của chủ dự án.
