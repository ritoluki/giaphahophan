# Hướng dẫn bắt đầu cho agent

## Thứ tự ưu tiên tài liệu

1. Yêu cầu mới nhất được chủ dự án phê duyệt, ghi vào `state/APPROVALS.json`.
2. `AGENTS.md`: an toàn, phạm vi tự chủ, tính trung thực của báo cáo.
3. Quy tắc dữ liệu, quyền riêng tư và tài chính: docs 07, 08, 10, 12, 14, 19.
4. PRD, màn hình, mobile, design system: docs 01–06.
5. API, kiến trúc, lộ trình và kiểm thử: docs 09, 15–18, 27, 30.
6. Hợp đồng máy đọc được trong `contracts/` và blueprint DB. Chúng phải đồng bộ với tài liệu; không tự lấy prototype HTML làm đặc tả quyền/API.
7. Demo và prototype chỉ minh họa, không có quyền ghi đè các quy tắc trên.

Khi phát hiện mâu thuẫn: chọn cách hạn chế quyền/lưu ít dữ liệu hơn để tiếp tục phần không bị ảnh hưởng; lập ADR và ghi BLOCKERS cho quyết định ảnh hưởng dữ liệu hoặc production. Không im lặng diễn giải khác ở mỗi module.

## Phiên đầu tiên

- Đọc README, AGENTS, docs 01, 05, 07, 10, 15–18 và backlog.
- Kiểm tra repo trống hay có code, `git status`, Node, package manager, Docker client **và daemon**. Ghi kết quả vào `state/ENVIRONMENT.md`.
- Kiểm tra registry/changelog/advisory chính thức, chốt phiên bản vào VERSIONS; tạo lockfile. Không tự nâng cấp công cụ toàn máy.
- Tạo scaffold, scripts kiểm tra và skeleton toàn bộ navigation; làm vertical slice: đăng nhập → đọc một hồ sơ → đề nghị sửa → người khác duyệt → thấy thay đổi và audit.
- P1 phải tạo giao diện đủ chất lượng để duyệt: trang chủ, tra cứu, hồ sơ người, lịch giỗ, quản trị trên 390px và 1440px. Đồng thời có thể triển khai dữ liệu/domain độc lập trong lúc chờ duyệt giao diện.
- Không yêu cầu dữ liệu thật để bắt đầu. Seed demo theo fixture, không tạo thân thế tổ tiên thật từ web.

## Mốc can thiệp của chủ dự án

| Mốc | Chủ dự án làm | Agent tiếp tục được gì khi chưa duyệt |
|---|---|---|
| H1 | Duyệt phong cách thiết kế và cách điều hướng trên mobile | Domain, DB, API, test, backend không phụ thuộc màu/chữ |
| H2 | Tạo/ủy quyền tài khoản dịch vụ, vùng dữ liệu, hạn mức chi phí, tên miền | Local, mock email, Docker images, CI template, runbook |
| H3 | Chốt người quản trị, quyền xuất bản, chính sách dữ liệu thật và lịch giỗ | Dùng demo và chính sách riêng tư nghiêm ngặt mặc định |
| H4 | Duyệt release candidate và cho phép đưa demo lên domain production | Hoàn thiện staging, sửa lỗi, diễn tập phục hồi |
| H5 | Xác nhận gói nhập dữ liệu thật và công bố nội dung chính thức | Website demo tiếp tục gắn nhãn; chuẩn bị dry-run/import report |

H4 và H5 có thể duyệt cùng lúc hoặc tách. Đưa demo lên hạ tầng production **không đồng nghĩa** được công khai dữ liệu thật. Không cho tính năng không bắt buộc như chatbot ngăn hoàn thành toàn bộ phạm vi bản 1.

## Điều kiện kết thúc một phiên

Cập nhật PROGRESS, TASKS, BLOCKERS, HUMAN_ACTIONS, TEST_REPORT và HANDOFF. Ghi commit, phần đang dở, lệnh tiếp theo, cách chạy lại, không chèn secret hoặc dữ liệu cá nhân vào các file trạng thái. Trước khi dừng, lưu việc đã làm; không để tiến trình chạy ngầm không có mô tả.


## Khi có khác biệt giữa mô tả và schema

Quyền riêng tư/approval không được nới lỏng. Với enum và trạng thái persistence, đọc contracts/STATE_MACHINES.md và data-dictionary.json; label UI không phải enum mới. Trước viết code, agent phải chạy một vòng contract reconciliation P0 và ghi ADR nếu cần đổi schema/API. SQL blueprint chưa là migration production. Thay đổi được phép là hoàn thiện implementation có test, không âm thầm bỏ feature/kiểm thử.
