# Hợp đồng máy đọc được

- `openapi.yaml`: endpoint BFF và DTO; HTTP semantics ở docs/09. Không phải server đã hoạt động.
- `domain.types.ts`: DTO đồng bộ từ schema; types không thay runtime validation hoặc authorization.
- `genealogy-date.schema.json`: cấu trúc ngày; domain validator kiểm tra ngày thực, lịch âm, precision và cấm tự điền thông tin chưa biết.
- `data-dictionary.json`: DB canonical; snake_case SQL được ánh xạ sang camelCase DTO, không serialize raw row.
- `requirements.json`, `test-cases.json`, `route-registry.json`: yêu cầu, kiểm thử dự kiến và màn hình; trạng thái ban đầu NOT_RUN.

P0 phải bổ sung adapter routes theo Supabase Auth SDK đang chốt: PKCE callback, signup invite acceptance, MFA enroll/challenge/remove, recovery confirmation, và cập nhật hợp đồng cùng test. Không lưu OTP/password vào DB ứng dụng. Chỉ membership approved mới vào nội bộ. Chính sách đổi field qua proposal áp dụng ở service, không cho dùng CRUD endpoint để né duyệt. Endpoint trả public Content/Person bắt buộc là whitelist projection, field riêng tư phải bị bỏ trước serialization. Public schemas cần tách bản rút gọn khi hiện thực để giảm khả năng lộ field.

Rich-text AST và ProposalItem.fieldChanges là hai miền mở có chủ đích: agent tạo discriminated schemas theo block/target và map whitelist tại P0/P2; không chấp nhận arbitrary HTML, SQL hay protected field. Tất cả chỉnh sửa contract phải có fixture và contract test. Không coi validation bộ đặc tả là test API thật.
