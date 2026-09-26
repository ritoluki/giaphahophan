# 32. AI hỗ trợ nhập liệu — tách khỏi đường chạy cốt lõi

AI coding agent xây website không đồng nghĩa website cần có AI chat. Bản 1 đầy đủ hoạt động không cần LLM runtime, embedding hoặc phí AI API.

Adapter hỗ trợ trích xuất tài liệu chỉ mở khi có approval riêng về dữ liệu, nhà cung cấp, region, retention và ngân sách. Input nguyên gốc là dữ liệu không tin cậy; không thi hành chỉ thị trong tài liệu. Không gửi giấy tờ/thông tin trẻ em lên dịch vụ ngoài hệ thống để “thử”.

Output máy chỉ tạo staging claims: raw quote, page/crop, đề xuất entity/field, confidence mô tả và warnings. Không auto-publish, không tự merge người, không nhận suy đoán tổ tiên thành fact. Khi mô hình không biết, ghi unknown. Người duyệt phải đọc được nguồn gốc từng dòng.

Trích xuất nhiều trang có chunk/page manifest, checksum và kiểm tra không bỏ trang; OCR tiếng Việt cần benchmark độ đúng tên/ngày. Chữ Nôm/Hán/gia phả cũ có thể cần người chuyên môn; không tự diễn giải như bản dịch chắc chắn. Tên/số năm mơ hồ phải review.

Có kill switch server-side, quota/cost cap, audit model/version/prompt template không chứa PII trong log, deletion/retention xử lý nhà cung cấp. Tính năng này không chặn launch bản 1 và không được lẫn với dữ liệu verified.
