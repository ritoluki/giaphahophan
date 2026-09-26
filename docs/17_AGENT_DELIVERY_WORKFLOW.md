# 17. Quy trình agent triển khai xuyên suốt

## Các chặng của cùng bản đầy đủ

| Chặng | Kết quả phải bàn giao | Gate |
|---|---|---|
| P0 | Repo, versions, môi trường, contracts, scripts, migration/CI nền | Lockfile, doctor thật, plan không mâu thuẫn |
| P1 | Design system và 5 màn hình chủ chốt responsive | H1 duyệt phong cách; tests mobile cơ bản |
| P2 | DB/Auth/permission skeleton + vertical slice sửa có duyệt | Cross-tree/IDOR/RLS/role tests |
| P3 | Hồ sơ, chi, nguồn, dates, tìm kiếm, nhập form đầy đủ | GR invariants, data quality |
| P4 | Graph, family focus, relationship path, merge | 10k stress, cycle race tests, mobile gesture |
| P5 | Import/export, source intake, media pipeline | Loss report, idempotency, scan/private storage |
| P6 | Calendar, RSVP, notifications, CMS, places | Lunar golden gate, outbox và consent |
| P7 | Quỹ, khuyến học, reporting | Two-person approvals, balanced ledger |
| P8 | Full hardening/QA/performance/accessibility | Requirement matrix không thiếu module |
| P9 | Staging hạ tầng thật, CI/CD, backup/restore, email | H2/H3, diễn tập restore và UAT |
| P10 | Release candidate và production demo/real theo duyệt | H4, release manifest, rollback, health |
| P11 | Intake dữ liệu thật, training và handover vận hành | H5, đối chiếu import và quyền, owner nhận quyền |

P0–P11 không phải lý do chia nhỏ sản phẩm còn sơ sài. Agent tự tiếp tục ticket sẵn sàng; không hỏi “có làm tiếp không?” sau mỗi component. Chỉ dừng phần liên quan tại gate cần người dùng.

## Backlog và traceability

`state/TASKS.json` là backlog máy đọc được; `state/TASKS.md` là bản xem nhanh. Mỗi ticket có ID, module, requirement IDs, dependency, output, acceptance, test IDs, status và evidence. Một agent tích hợp cập nhật JSON, tránh hai nguồn trạng thái cạnh tranh. Markdown được sinh lại từ JSON khi thay đổi.

Requirement IDs và test case IDs được đối chiếu trong docs 27/contracts. Không đóng ticket vì đã tạo file; đóng khi acceptance có evidence. Nếu một task lớn bị tách, task con phải kế thừa requirement/test, không bỏ scope.

## Hợp tác nhiều agent

Coordinator quản lý contract/schema/release. UI agent làm components/screens; domain agent làm genealogy/calendar; platform agent auth/jobs/deploy; QA agent độc lập test/audit. Mỗi nhánh có ownership file và contract freeze để tránh overwrite. Thay API/DB đi qua coordinator; không đồng thời sửa migration đã merged.

Không tự dùng nhiều agent nếu môi trường chỉ có một. Một agent có thể đảm nhiệm các vai trò theo lượt và giữ checklist review độc lập. Không gán nhãn “independent review” khi cùng agent tự chạy lại cùng luận điểm mà không test mới.

## Hành vi khi bị chặn

Blocker gồm ảnh hưởng, lỗi/bằng chứng, việc đã thử, lựa chọn an toàn, việc cụ thể cần chủ dự án và phần có thể làm tiếp. Không lặp lại một lệnh thất bại vô hạn. Không tự chuyển sang dịch vụ tính phí hoặc tắt security để vượt blocker.

Yêu cầu người dùng gộp theo H1–H5, không hỏi những tên biến, vị trí file hoặc màu đã chốt. Deadline không do agent tự hứa; tiến độ tính bằng evidence và scope còn lại.

## Bàn giao sau mỗi phiên

PROGRESS: chặng/ticket, commit, thay đổi, vấn đề, bước tiếp. TEST_REPORT: lệnh, exit code, môi trường, thời gian, log/artifact, PASS/FAIL/NOT_RUN. HANDOFF: đường chạy chính xác, app đang chạy hay không, credentials chỉ tên biến, chưa làm gì. HUMAN_ACTIONS: chỉ những việc thật sự cần quyền/duyệt, không backlog code đẩy cho người dùng.

## Quy tắc quyết định

Nhỏ, đảo ngược, không đổi dữ liệu/API/chi phí: agent tự quyết và ghi note. Thay stack, public policy, region, tiền, delete/merge lớn, real data hoặc production: ADR + approval. Khi chưa có quyết định, mặc định bảo mật chặt hơn và dùng demo; không tự coi im lặng là đồng ý.
