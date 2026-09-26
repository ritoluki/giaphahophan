# Backlog triển khai

Canonical: `TASKS.json`. P0 đang có scaffold ứng dụng và foundation code; các phần phụ thuộc Docker/Supabase/Node 24 vẫn chưa đóng.

| ID | Chặng | Công việc | Phụ thuộc | Duyệt |
|---|---|---|---|---|
| P0-01 | P0 | Kiểm tra môi trường và workspace |  | DONE — Node 24.21.0/pnpm 12.6.0/Docker PASS; browser remains partial |
| P0-02 | P0 | Chốt phiên bản và license | P0-01 | DONE — lockfile + audit sạch |
| P0-03 | P0 | Scaffold workspace và scripts | P0-02 | DONE — typecheck/test/lint/build; commit/push `eab9754` |
| P0-04 | P0 | Contract và DB migrations nền | P0-03 | IN_PROGRESS — foundation migration applied local; RLS/integration tests NOT_RUN |
| P0-05 | P0 | CI và test harness | P0-03 | IN_PROGRESS — CI template + browser smoke; DB integration NOT_RUN |
| UI-01 | P1 | Design tokens và component stories | P0-03 | IN_PROGRESS — shared components/tokens + responsive/a11y smoke 18/18; full stories/axe/manual audit NOT_RUN |
| UI-02 | P1 | Năm màn hình duyệt phong cách | UI-01 | IN_PROGRESS — admin preview included; 18 screenshots at 1440/Pixel 5/320; H1 approval PENDING |
| CORE-01 | P2 | Auth/RPC/permission foundation | P0-04 | IN_PROGRESS — RPC/projection/grants + true concurrency PASS; full RLS matrix và remote CI còn lại |
| CORE-02 | P2 | Vertical slice có DB và review | CORE-01, P0-05 | IN_PROGRESS — person + parent-link proposal/review/projection/idempotency + true concurrency PASS local; remaining target kinds và remote CI còn lại |
| JOBS-01 | P2 | Outbox/worker nền | P0-04 | IN_PROGRESS — migration 0009, service_role-only claim/lease/retry tests PASS local; typed dispatcher tests 5/5 PASS; remote CI/runtime credential adapter NOT_RUN |
| M01-01 | P1 | Public projection | UI-02, CORE-02 |  |
| M01-02 | P1 | Tra cứu nổi bật | M01-01 |  |
| M01-03 | P1 | Nội dung có thứ bậc | M01-02 |  |
| M01-04 | P1 | Demo và empty state | M01-03 |  |
| M02-01 | P6 | Phả ký có nguồn | M12-04, M09-05 |  |
| M02-02 | P6 | Timeline bất định | M02-01 |  |
| M02-03 | P6 | Chi họ nhiều root | M02-02 |  |
| M02-04 | P6 | Xuất bản có duyệt | M02-03 |  |
| M03-01 | P3 | Canonical identity | CORE-02 | IN_PROGRESS — migration 0010, duplicate-name/alias/restricted projection test PASS local; contract/domain/API typecheck and build PASS; full mobile visual/a11y NOT_RUN |
| M03-02 | P3 | Dates và life status | M03-01 | IN_PROGRESS — migration 0011 person_facts, year-only/originalText/privacy test PASS local; regression/typecheck/build PASS; mobile visual/a11y NOT_RUN |
| M03-03 | P3 | Hồ sơ đa lớp | M03-02 | IN_PROGRESS — mobile tabs overview/family/timeline/sources/media; E2E 21/21 desktop/Pixel5/320 PASS; DB/API aggregate, axe/manual/real-device NOT_RUN |
| M03-04 | P3 | Person khác account | M03-03 | IN_PROGRESS — claims migration/RPC/BFF, self-review denial, independent approval, idempotency and no auto-capability PASS local; mobile visual/a11y NOT_RUN |
| M03-05 | P3 | Sửa có version | M03-04 |  |
| M03-06 | P3 | Xóa có tác động | M03-05 |  |
| M04-01 | P4 | Các chế độ cây | M03-06, M06-04 |  |
| M04-02 | P4 | Pedigree collapse | M04-01 |  |
| M04-03 | P4 | Giới hạn và expand | M04-02 |  |
| M04-04 | P4 | Mobile/keyboard | M04-03 |  |
| M04-05 | P4 | Cycle concurrency | M04-04 |  |
| M04-06 | P4 | Đời tương đối | M04-05 |  |
| M05-01 | P4 | Path có quyền | M04-06 |  |
| M05-02 | P4 | Semantics quan hệ | M05-01 |  |
| M05-03 | P4 | Giới hạn rõ | M05-02 |  |
| M05-04 | P4 | Xưng hô thận trọng | M05-03 |  |
| M06-01 | P3 | Tên có và không dấu | M03-06 |  |
| M06-02 | P3 | Filter và cursor | M06-01 |  |
| M06-03 | P3 | Không lộ metadata | M06-02 |  |
| M06-04 | P3 | Tải lớn | M06-03 |  |
| M07-01 | P2 | Invitation | CORE-01 |  |
| M07-02 | P2 | Session và logout | M07-01 |  |
| M07-03 | P2 | MFA đặc quyền | M07-02 |  |
| M07-04 | P2 | Membership và owner | M07-03 |  |
| M07-05 | P2 | Recovery và claim | M07-04 |  |
| M08-01 | P3 | Đề nghị có nguồn | M03-06, M07-05 |  |
| M08-02 | P3 | Diff và conflict | M08-01 |  |
| M08-03 | P3 | Approve atomic | M08-02 |  |
| M08-04 | P3 | Scope và 2 người | M08-03 |  |
| M08-05 | P3 | Lifecycle rõ | M08-04 |  |
| M09-01 | P5 | Upload an toàn | CORE-02, JOBS-01 |  |
| M09-02 | P5 | Original và derivative | M09-01 |  |
| M09-03 | P5 | Citation thật | M09-02 |  |
| M09-04 | P5 | Quyền liên kết | M09-03 |  |
| M09-05 | P5 | Viewer mobile | M09-04 |  |
| M10-01 | P6 | Adapter Việt Nam | M03-06, M09-05 |  |
| M10-02 | P6 | Recurrence policy | M10-01 |  |
| M10-03 | P6 | Ngày gốc và lần tới | M10-02 |  |
| M10-04 | P6 | Override/version | M10-03 |  |
| M10-05 | P6 | RSVP | M10-04 |  |
| M10-06 | P6 | ICS đúng ngày | M10-05 |  |
| M11-01 | P6 | Outbox atomic | M10-06, JOBS-01 |  |
| M11-02 | P6 | Gửi idempotent | M11-01 |  |
| M11-03 | P6 | Privacy và preference | M11-02 |  |
| M11-04 | P6 | Counters và failure | M11-03 |  |
| M12-01 | P6 | Rich text an toàn | M09-05, M08-05 |  |
| M12-02 | P6 | Revision/publish | M12-01 |  |
| M12-03 | P6 | Public SEO | M12-02 |  |
| M12-04 | P6 | Tìm đọc mobile | M12-03 |  |
| M13-01 | P6 | Place/burial model | M09-05 |  |
| M13-02 | P6 | Coordinates private | M13-01 |  |
| M13-03 | P6 | Media và directions | M13-02 |  |
| M13-04 | P6 | Map adapter gate | M13-03 |  |
| M14-01 | P7 | Balanced ledger | M07-05, M09-05 |  |
| M14-02 | P7 | 2-person post | M14-01 |  |
| M14-03 | P7 | Immutable/reversal | M14-02 |  |
| M14-04 | P7 | Reports và privacy | M14-03 |  |
| M14-05 | P7 | Đối chiếu kỳ | M14-04 |  |
| M15-01 | P7 | Chương trình/đề cử | M14-05 |  |
| M15-02 | P7 | Minors và nguồn | M15-01 |  |
| M15-03 | P7 | Award và thanh toán | M15-02 |  |
| M15-04 | P7 | Báo cáo | M15-03 |  |
| M16-01 | P5 | Intake/dry-run | M03-06, M08-05, M09-05 |  |
| M16-02 | P5 | Structured schema | M16-01 |  |
| M16-03 | P5 | GEDCOM subset | M16-02 |  |
| M16-04 | P5 | Idempotent import | M16-03 |  |
| M16-05 | P5 | Partial/cancel/undo | M16-04 |  |
| M16-06 | P5 | Permission exports | M16-05 |  |
| M17-01 | P8 | Quality queue | M08-05, M04-06, M16-06 |  |
| M17-02 | P8 | Merge preview | M17-01 |  |
| M17-03 | P8 | Merge compensation | M17-02 |  |
| M17-04 | P8 | Audit tối thiểu | M17-03 |  |
| M17-05 | P8 | Privacy workflow | M17-04 |  |
| M18-01 | P9 | Env/ownership | P0-05, JOBS-01 | H2 |
| M18-02 | P9 | CI/release artifacts | M18-01 |  |
| M18-03 | P9 | Backup đầy đủ | M18-02 |  |
| M18-04 | P9 | Monitoring/runbooks | M18-03 |  |
| M18-05 | P9 | Chuẩn bị công cụ và checklist deployment gate | M18-04 |  |
| M18-06 | P9 | Handover | M18-05 |  |
| QA-ALL | P8 | Kiểm tra toàn bộ phạm vi bản 1 | M01-04, M02-04, M03-06, M04-06, M05-04, M06-04, M07-05, M08-05, M09-05, M10-06, M11-04, M12-04, M13-04, M14-05, M15-04, M16-06, M17-05 | H1 |
| STAGE-01 | P9 | UAT và diễn tập restore trên staging | QA-ALL, M18-06 | H2, H3 |
| RELEASE-01 | P10 | Phát hành production theo mode đã duyệt | STAGE-01 | H4 |
| REAL-01 | P11 | Intake và cutover dữ liệu thật | RELEASE-01, M16-06 | H5 |
| HANDOVER-01 | P11 | Bàn giao và đào tạo người phụ trách | RELEASE-01 | H4 |
