# Môi trường cần agent xác minh

Trạng thái: PARTIALLY_VERIFIED trên workspace ngày 26/09/2026 22:52 Asia/Saigon.

| Hạng mục | Giá trị dự kiến | Kết quả thực tế |
|---|---|---|
| Workspace | `C:\Phan_Gia_Pha_End_to_End_Agent_Kit_v1\phan-gia-pha-agent-kit` | PASS — đúng workspace hiện tại; Git repository đã liên kết remote owner |
| OS | Windows; ghi build thực tế | PASS — `Microsoft Windows NT 10.0.26200.0` |
| Node | 24 LTS, exact patch chốt ở P0 | BLOCKED — local `v22.13.0`; package/CI yêu cầu Node 24 |
| pnpm | Bản tương thích exact | PASS — `12.6.0`, `pnpm-lock.yaml` tạo được |
| Docker client | docker version | PASS — Docker `29.8.0`, build `88096ef` |
| Docker daemon | docker info / Server section | BLOCKED — với `DOCKER_CONFIG=.docker-config`, client báo không tìm thấy `//./pipe/docker_engine`; Docker daemon chưa chạy. Config mặc định cũng bị `Access is denied` |
| Supabase local | CLI + Docker | NOT_RUN — phụ thuộc Docker daemon; chưa cài/chạy CLI |
| Browser | Chromium và WebKit test; real mobile riêng | NOT_RUN — Playwright browser/E2E chưa cài/chạy |
| Git | repo riêng, không lẫn project công việc | PASS — `main` sạch và đồng bộ `origin/main` tại commit `eab975447bd4b5f73daf4685590fac633e4166da`; staged audit không có env/secret thật |

## Bằng chứng lệnh

- `node --version` → `v22.13.0`; `npm.cmd --version` → `10.9.2`; `pnpm.cmd --version` → `12.6.0`.
- `pnpm run doctor` → exit `2`: Node baseline và Docker daemon BLOCKED; file nền/lockfile/asset PASS.
- `DOCKER_CONFIG=.docker-config docker.exe version` → client PASS, Server BLOCKED vì named pipe Docker Engine không tồn tại.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm verify` đã chạy thật trong workspace.
- Không ghi giá trị `.env`, secret, cookie, database URL hoặc dữ liệu gia phả thật.
