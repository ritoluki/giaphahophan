# 14. Quỹ họ, công đức và khuyến học

## Giới hạn nghiệp vụ

Module minh bạch nội bộ, ghi nhận và đối chiếu thu–chi; không tích hợp thanh toán, không tự truy cập tài khoản ngân hàng, không thay phần mềm kế toán/thuế hoặc xác nhận pháp lý về quyên góp. Tài khoản nhận tiền nếu hiển thị phải là nội dung do người phụ trách xác nhận; không tự sinh tài khoản/QR thu tiền.

## Quỹ và sổ

Một tree có nhiều fund: quỹ chung, khuyến học, tu bổ... Mỗi fund có tài khoản sổ: cash/bank (asset), contribution (income), activity_expense (expense), restricted_balance theo quy tắc đã chốt. Journal có date, description, amount mục đích, source proof private và lines signed bigint VND; tổng signed amount của tất cả lines phải bằng 0.

Ví dụ demo: thu 1.000.000 VND: debit cash +1000000, credit contribution −1000000. Chi học bổng 300.000 VND: debit scholarship_expense +300000, credit cash −300000. UI chỉ hiển thị phiếu thu/chi dễ hiểu, engine giữ cân bằng. Không cho người dùng nhập journal line tùy ý vượt tài khoản được cho phép.

API truyền tiền bằng chuỗi số nguyên (`"1000000"`), không float. Số tiền âm chỉ xuất hiện trong bút toán đảo/line engine; form thu–chi amount luôn dương. Date không nằm kỳ đã khóa. Không cho transaction khác currency tự quy đổi ngầm; bản 1 chỉ VND.

## Workflow

Draft → submitted → posted hoặc rejected; posted không sửa/xóa. Người tạo có treasury.write; người khác có treasury.approve + MFA chốt. Dù owner có cả hai grant vẫn không tự duyệt phiếu mình tạo. Sửa phiếu posted bằng reversal được duyệt rồi phiếu thay thế, giữ mã liên kết. Unique reversal guard ngăn đảo hai lần ngoài quy trình rõ ràng.

Đính chứng từ có malware scan và visibility restricted; ảnh chứa tài khoản cá nhân được che trong bản công khai. Journal post atomic: lock period/entry, kiểm tra 2-person rule, sum(lines)=0, version, grant, source ready; ghi audit/outbox cùng transaction. Không sửa số dư bằng một ô `balance` mà bỏ nhật ký.

## Minh bạch và riêng tư

Member có thể xem tổng thu/chi và báo cáo đã xuất bản nếu policy cho phép; không mặc nhiên xem từng người đóng bao nhiêu. Donor display: explicit name consent hoặc “Thành viên ẩn danh”. Không lập bảng xếp hạng đóng góp, không tự công khai số điện thoại/tài khoản hoặc bình luận gây áp lực.

Reports: kỳ thời gian, opening balance, total receipts, total payments, closing balance, phân loại hoạt động, đối chiếu proof. Export chỉ projection được phép. Report snapshot có version/ngày lập/trạng thái và không gắn nhãn “đã kiểm toán”.

## Khuyến học

Program có năm/đợt, tiêu chí, thời hạn, nguồn quỹ, nội dung công khai. Application gồm person_id, người đề cử, thành tích mô tả, bằng chứng private, trạng thái draft/submitted/review/approved/rejected/withdrawn. Hạn chế thu thập học bạ/thông tin không cần thiết; ứng viên vị thành niên cần quy trình người đại diện đã chốt tại H3.

Award được duyệt không đồng nghĩa đã chi tiền. Award.paid_journal_entry_id trỏ bút toán posted; một award không được ghi chi hai lần; reversal cập nhật trạng thái disbursement bằng quy trình bù. Công khai câu chuyện/thành tích là approval khác với approval nhận hỗ trợ.

## Test bắt buộc

Tự duyệt bị chặn tại API và DB; float/amount quá range bị reject; post lại cùng key không tăng tiền; concurrent post một entry chỉ thành công một lần; unbalanced journal rollback; không sửa posted bằng PATCH trực tiếp; reversal không làm mất lịch sử; donor private không lộ trong CSV/PDF; award cancelled không tự gửi email có tên trẻ em.
