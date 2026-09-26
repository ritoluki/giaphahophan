# Phạm vi đã kiểm tra khi bàn giao bộ hồ sơ

## Đã thực hiện

- Đối chiếu 87 requirements, 87 kịch bản test dự kiến, 102 task và DAG dependency; không có ID thiếu hoặc chu trình task.
- Đọc JSON, kiểm references và schema structure của OpenAPI: 117 operations, 95 paths, 92 component schemas. Đây không phải kiểm thử endpoint đang chạy.
- Compile TypeScript cho file DTO `contracts/domain.types.ts`; không phải build ứng dụng Next.js.
- Kiểm tra fixture 72 người/84 parent links/10 unions: references, ancestry DAG, cấu trúc ngày và cân bằng hai bút toán demo. Không xác nhận thuật toán lịch âm.
- Kiểm SQL tĩnh: 53 bảng và các khai báo bật RLS tương ứng; chưa execute SQL, chưa kiểm runtime grants/triggers/RPC.
- Tính contrast các cặp token chữ chính. Không gọi đây là kiểm toán WCAG đầy đủ.
- Chạy mẫu HTML bằng Chromium: 6 view × 6 viewport (320/360/390/412/768/1440) không tràn ngang; thử tìm không dấu, không có kết quả, lọc chi, mở hồ sơ và dialog. Browser test dùng nội dung HTML inline vì môi trường kiểm thử chặn file URL.
- Chạy công cụ sinh graph hư cấu 10.000 người; chưa chạy tải ứng dụng.
- Render Word 12 trang và kiểm tra từng trang sau bản sửa cuối: không trang trắng do tràn, không cắt nội dung/bảng.

## Chưa thực hiện vì đây là bộ đặc tả

Chưa scaffold hoặc build app; chưa chạy Supabase/Next.js/worker; chưa triển khai migrations; chưa chạy security/RLS, lunar goldens, concurrency, end-to-end ứng dụng, thiết bị thật, staging, restore drill hoặc production. Chưa có tài khoản/credential/approval của chủ dự án. Các trạng thái ứng dụng trong state/TEST_REPORT.md và contracts/test-cases.json vẫn NOT_RUN.

SQL blueprint, hợp đồng API, fixture và HTML là đầu vào cho agent triển khai. Không chạy SQL blueprint trực tiếp trên production. Mẫu HTML không đăng nhập, không lưu dữ liệu, không gửi email và không đọc tài liệu thật. Sổ tay Word không thay 32 tài liệu kỹ thuật chi tiết.

Báo cáo máy đọc: PACKAGE_VALIDATION.json. Khi chạy lại tools/validate_package.py, script tạo lại phần kiểm tra tự động; phần browser/Word phải chạy và xác nhận lại riêng nếu tệp đã thay đổi.
