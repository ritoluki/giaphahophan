# Blockers

Đã kiểm tra local ngày 26/09/2026. Các blocker thực tế được tách khỏi approval gate; phần không phụ thuộc blocker vẫn tiếp tục.

| ID | Dependency | Chặn phần nào | Việc vẫn làm được |
|---|---|---|---|
| DEP-01 | Quyền mua/chọn cloud và domain H2 | Provision cloud thật | Local demo, code, test |
| DEP-02 | Duyệt phong cách H1 | Chốt visual cuối | Theme/prototype/backend |
| DEP-03 | Người phụ trách dữ liệu, quyền và lịch giỗ H3 | Policy thật | Demo/test policy |
| DEP-04 | Approval manifest H4 | Production release | Staging và audit |
| DEP-05 | Tài liệu thật và H5 | Import dữ liệu thật | Toàn bộ demo và import engine |
| ENV-01 | RESOLVED — Node `24.21.0` active và `pnpm run doctor` exit 0 | — | Node 24 quality checks đã chạy; giữ Node 24 cho CI/release |
| ENV-02 | RESOLVED — Docker Desktop daemon đã chạy và Supabase local stack healthy | — | DB/RLS local integration có thể tiếp tục; giữ bằng chứng container/endpoint trong state |
| P1-01 | H1 visual approval và full accessibility review chưa có; WebKit/real-device chưa chạy | UI-01/UI-02 completion và final visual gate | Chromium responsive/a11y smoke 18/18, 18 screenshots, fixture-driven routes, typecheck/lint/build |
| CORE-01 | Authenticated session wiring, concurrency matrix và full RLS negative coverage chưa hoàn tất | CORE-02 DB vertical slice và broader role acceptance | Allowlisted local RPC/projection/grants; cross-tree synthetic DB test PASS; public-key API route wired |
| CORE-02 | Chưa có deterministic local auth session seed và approved projection apply policy cho proposal review | DB-backed proposal→review→projection acceptance | Input/output API schemas + RPC calls + invalid-payload smoke; không cần dữ liệu thật |

Git push P0: CLEAR — commit `eab975447bd4b5f73daf4685590fac633e4166da` đã đồng bộ trên `origin/main`; không phát sinh blocker quyền truy cập remote.

Agent ghi blocker thực theo mẫu: bằng chứng, nguyên nhân giả thuyết, thử đã làm, rủi ro, hành động còn thiếu, owner, task phụ thuộc. Không lặp yêu cầu người dùng đã hoàn tất.
