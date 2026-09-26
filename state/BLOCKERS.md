# Blockers

Đã kiểm tra local ngày 26/09/2026. Các blocker thực tế được tách khỏi approval gate; phần không phụ thuộc blocker vẫn tiếp tục.

| ID | Dependency | Chặn phần nào | Việc vẫn làm được |
|---|---|---|---|
| DEP-01 | Quyền mua/chọn cloud và domain H2 | Provision cloud thật | Local demo, code, test |
| DEP-02 | Duyệt phong cách H1 | Chốt visual cuối | Theme/prototype/backend |
| DEP-03 | Người phụ trách dữ liệu, quyền và lịch giỗ H3 | Policy thật | Demo/test policy |
| DEP-04 | Approval manifest H4 | Production release | Staging và audit |
| DEP-05 | Tài liệu thật và H5 | Import dữ liệu thật | Toàn bộ demo và import engine |
| ENV-01 | Local Node `22.13.0`, trong khi manifest/CI yêu cầu Node 24 | Node 24-specific verification và release baseline | Typecheck/test/build đã chạy trên Node 22, nhưng không thay thế gate Node 24 |
| ENV-02 | Docker daemon chưa chạy: `DOCKER_CONFIG=.docker-config docker.exe version` báo named pipe `docker_engine` không tồn tại; config mặc định cũng bị Access denied | Supabase local, migration execution, RLS/DB integration, restore drill | UI, domain unit, contract schemas, migration static review, CI template |
| P1-01 | H1 visual approval và full accessibility review chưa có; WebKit/real-device chưa chạy | UI-01/UI-02 completion và final visual gate | Chromium desktop/mobile E2E 8/8, 10 screenshots, fixture-driven routes, typecheck/lint/build |

Git push P0: CLEAR — commit `eab975447bd4b5f73daf4685590fac633e4166da` đã đồng bộ trên `origin/main`; không phát sinh blocker quyền truy cập remote.

Agent ghi blocker thực theo mẫu: bằng chứng, nguyên nhân giả thuyết, thử đã làm, rủi ro, hành động còn thiếu, owner, task phụ thuộc. Không lặp yêu cầu người dùng đã hoàn tất.
