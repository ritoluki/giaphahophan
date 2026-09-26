# Môi trường cần agent xác minh

Trạng thái: PARTIALLY_VERIFIED trên workspace ngày 27/09/2026 00:48 Asia/Saigon.

| Hạng mục | Giá trị dự kiến | Kết quả thực tế |
|---|---|---|
| Workspace | `C:\Phan_Gia_Pha_End_to_End_Agent_Kit_v1\phan-gia-pha-agent-kit` | PASS — đúng workspace hiện tại; Git repository đã liên kết remote owner |
| OS | Windows; ghi build thực tế | PASS — `Microsoft Windows NT 10.0.26200.0` |
| Node | 24 LTS, exact patch chốt ở P0 | LOCAL-ACCEPTED — local `v22.13.0` chạy được lint/typecheck/test/build/E2E; package/CI vẫn yêu cầu Node 24 cho release baseline |
| pnpm | Bản tương thích exact | PASS — `12.6.0`, `pnpm-lock.yaml` tạo được |
| Docker client | docker version | PASS — Docker `29.8.0`, build `88096ef` |
| Docker daemon | docker info / Server section | PASS — Docker `29.8.0` server trên context `desktop-linux` |
| Supabase local | CLI + Docker | PASS — CLI `2.118.0`; local stack healthy; migration `0001_foundation.sql` applied; endpoints localhost 54321–54324 trả 200 |
| Browser | Chromium và WebKit test; real mobile riêng | PARTIAL — Chromium 140.0.7339.186 installed; responsive/a11y smoke PASS 18/18 at desktop 1440px, Pixel 5 and 320px; WebKit/real device NOT_RUN |
| Git | repo riêng, không lẫn project công việc | PASS — `main` sạch và đồng bộ `origin/main`; staged audit không có env/secret thật |

## Bằng chứng lệnh

- `node --version` → `v22.13.0`; `npm.cmd --version` → `10.9.2`; `pnpm.cmd --version` → `12.6.0`.
- `pnpm run doctor` → exit `2`: chỉ Node 24 baseline BLOCKED; Docker daemon, file nền/lockfile/asset PASS.
- `docker.exe version` → client/server PASS; Server `29.8.0`, context `desktop-linux`.
- `pnpm exec supabase --version` → `2.118.0`; `pnpm exec supabase start --network-id phan-local` → exit `0`, migration foundation applied.
- `docker.exe ps` → 10 Supabase containers healthy/running; REST/Studio/Mailpit localhost trả HTTP `200`.
- CLI tạo `supabase/.branches/` và `supabase/.temp/`; cả hai là metadata local đã được gitignore.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm verify`, `pnpm test:e2e` đã chạy thật trong workspace.
- Không ghi giá trị `.env`, secret, cookie, database URL hoặc dữ liệu gia phả thật.
