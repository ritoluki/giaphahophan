# 16. Khởi tạo từ số 0 trên Windows

## Nguyên tắc môi trường

Workspace riêng, ví dụ `C:\phan-gia-pha`, không đặt trong thư mục đồng bộ hoặc repo công việc. Windows có Node/pnpm/Docker đang chạy được thì tái sử dụng, không bắt cài lại mọi thứ. Agent kiểm tra phiên terminal hiện tại nhận PATH trước khi kết luận máy chưa cài.

Các lệnh ứng dụng `pnpm doctor`, `pnpm verify`... dưới đây là **script agent phải tạo tại P0**, chưa tồn tại như ứng dụng hoàn chỉnh trong bộ hồ sơ này. Không chạy rồi báo “tài liệu lỗi” vì chưa scaffold.

## P0.1 — Kiểm tra không thay đổi hệ thống

```powershell
Get-Location
git status --short
node --version
npm --version
pnpm --version
docker version
docker compose version
```

`docker --version` chỉ chứng minh có client; `docker version` phải có Server/Engine. Nếu PowerShell không thấy executable, dùng `Get-Command docker -ErrorAction SilentlyContinue`, kiểm tra PATH, hỏi người dùng mở lại VS Code/terminal sau cài đặt. Không sửa registry, BIOS/virtualization, WSL hoặc chạy admin không được duyệt.

Nếu Docker daemon không hoạt động hoặc WSL báo quyền truy cập: agent ghi lỗi nguyên văn đã bỏ thông tin nhạy cảm; người dùng mở Docker Desktop hoặc xử lý quyền hệ điều hành. Agent tiếp tục UI/domain/tests không phụ thuộc Docker; DB integration ghi BLOCKED, không PASS. Hosted DEV chỉ dùng project riêng sau H2, không dùng production để thay localhost.

## P0.2 — Tạo repo và scaffold

Kiểm tra folder trống/đã có kit; git init chỉ khi chưa là repo. Chốt versions, tạo pnpm workspace, root scripts và env schemas. Scaffold Next vào apps/web, worker vào apps/worker. Không dùng create-next-app với flag chưa tra phiên bản; đọc help của CLI đã pin. Không chạy lệnh xóa thư mục tạm nếu có dữ liệu chưa xác minh.

Cài Supabase CLI dạng devDependency và container runtime theo docs chính thức; pnpm mới có cơ chế duyệt lifecycle script, chỉ allowlist package cần thiết, không blanket allow all. [S13]

## P0.3 — Local stack

```powershell
pnpm exec supabase init
# Create a localhost-bound network once, after checking it does not exist.
docker network create -o "com.docker.network.bridge.host_binding_ipv4=127.0.0.1" phan-local
pnpm exec supabase start --network-id phan-local
```

Agent kiểm tra syntax CLI đang dùng trước khi chạy. Dịch vụ local không được bind công khai. Supabase Studio dự kiến port local từ CLI output; lấy URL/anon key từ output và ghi env local bị gitignore, không commit output chứa secret. Storage/Auth local cùng stack; email dùng mailbox local của stack hoặc Mailpit local, không gửi Resend thật.

Tạo schema migration đầu, roles/policies fail-closed, seed tree demo và tài khoản test bằng script server-only. Password demo sinh ngẫu nhiên ở local và hiển thị cho người dùng theo kênh riêng, không hardcode trong fixtures hoặc docs. Không seed admin cố định lên remote.

## Scripts bắt buộc agent cung cấp

| Script | Tác dụng | Điều kiện |
|---|---|---|
| pnpm doctor | Node/pnpm/Docker/ports/env/network/CLI/provider readiness | Không in secret; exit khác 0 khi thiếu dependency cốt lõi |
| pnpm dev | Web + worker local, shutdown clean | Không auto-run migration/reset remote |
| pnpm db:migrate:local | Áp dụng migration pending local | Kiểm tra host localhost allowlist |
| pnpm seed:demo | Seed deterministic demo | Chỉ dev/staging hoặc production-demo được H4 chấp thuận rõ |
| pnpm seed:benchmark --count 10000 | Synthetic stress data | Không ghi vào tree thật; workspace/env guard |
| pnpm lint / typecheck / test | Chất lượng static/unit | Không bỏ qua code worker/contracts |
| pnpm test:db / test:integration / test:e2e | Policy/DB/luồng người dùng | Stack thật, không fixture provider giả |
| pnpm test:a11y / test:visual / test:load | Accessibility/screenshot/load | Build/môi trường/thiết bị ghi rõ |
| pnpm build / verify | Build production; bộ kiểm tra chuẩn | verify không biến NOT_RUN thành PASS |
| pnpm release:check | Gates, env, manifest, migration, secret scan | Fail khi HUMAN_APPROVAL thiếu |
| pnpm backup:check / restore:verify | Kiểm tra backup manifest và phục hồi sandbox | Không restore production tự động |

## .env và cấu hình

`.env.example` chỉ placeholders; `packages/config` validate bắt buộc theo APP_ENV và DATA_MODE. APP_ENV development/staging/production tách DATA_MODE demo/real. Nếu production+real mà có demo seed flag, test account hoặc mock provider thì startup fail. Production+demo phải có explicit release approval và banner/noindex.

Chỉ NEXT_PUBLIC_SUPABASE_URL, publishable key và những giá trị thực sự public được prefix NEXT_PUBLIC. Service/secret key, DB URL, encryption key, backup password, Resend key, monitoring auth token không được public. Không log env object hoặc upload file env để agent ngoài đọc.

## Dừng và tiếp tục

Ctrl+C phải dừng child processes; ghi PID khi cần. Không chiếm port rồi tự kill process khác chưa biết thuộc dự án nào. Phiên tiếp theo đọc HANDOFF, chạy doctor và xác định đúng branch/env trước khi tiếp tục. Build treo phải có timeout, log giai đoạn và điều tra, không báo thành công vì không có error.
