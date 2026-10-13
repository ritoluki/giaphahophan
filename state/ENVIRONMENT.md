# Môi trường cần agent xác minh

2026-10-13 local verification: Node24.21.0, pnpm12.6.0, Docker server29.8.0 available with authorized execution. Existing local Supabase containers used only for synthetic transaction-rollback tests. Dev-only GEDCOM QA image built from a digest-pinned Debian bookworm base, Gramps5.1.5-1 and SHA-verified official GeneWeb7.1.0-beta2 Linux ZIP; image fingerprint and library versions in fixture manifest/evidence. Runtime QA network disabled, root read-only, bounded resources, profiles/input/output scoped to workspace. No Windows desktop app installation or hosted service used. Supabase local public build settings captured transiently and loopback-checked; owner env values not logged. No further owner setup is needed for this QA path.

Trạng thái: VERIFIED_WITH_BROWSER_PARTIAL trên workspace ngày 27/09/2026 01:38 Asia/Saigon.

| Hạng mục | Giá trị dự kiến | Kết quả thực tế |
|---|---|---|
| Workspace | `C:\Phan_Gia_Pha_End_to_End_Agent_Kit_v1\phan-gia-pha-agent-kit` | PASS — đúng workspace hiện tại; Git repository đã liên kết remote owner |
| OS | Windows; ghi build thực tế | PASS — `Microsoft Windows NT 10.0.26200.0` |
| Node | 24 LTS, exact patch chốt ở P0 | PASS — local `v24.21.0`; package/CI baseline được đáp ứng |
| pnpm | Bản tương thích exact | PASS — `12.6.0`, `pnpm-lock.yaml` tạo được |
| Docker client | docker version | PASS — Docker `29.8.0`, build `88096ef` |
| Docker daemon | docker info / Server section | PASS — Docker `29.8.0` server trên context `desktop-linux` |
| Supabase local | CLI + Docker | PASS — CLI `2.118.0`; local stack healthy; migration `0001_foundation.sql` applied; endpoints localhost 54321–54324 trả 200 |
| Browser | Chromium và WebKit test; real mobile riêng | PARTIAL — Chromium 140.0.7339.186 installed; responsive/a11y smoke PASS 18/18 at desktop 1440px, Pixel 5 and 320px; WebKit/real device NOT_RUN |
| Git | repo riêng, không lẫn project công việc | PASS — `main` sạch và đồng bộ `origin/main`; staged audit không có env/secret thật |

## Bằng chứng lệnh

- `node --version` → `v24.21.0`; `pnpm.cmd --version` → `12.6.0`.
- `pnpm run doctor` → exit `0`: Node 24 baseline, Docker daemon, file nền/lockfile/asset PASS.
- `docker.exe version` → client/server PASS; Server `29.8.0`, context `desktop-linux`.
- `pnpm exec supabase --version` → `2.118.0`; `pnpm exec supabase start --network-id phan-local` → exit `0`, migration foundation applied.
- `docker.exe ps` → 10 Supabase containers healthy/running; REST/Studio/Mailpit localhost trả HTTP `200`.
- CLI tạo `supabase/.branches/` và `supabase/.temp/`; cả hai là metadata local đã được gitignore.
- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm lint`, `pnpm build` đã chạy thật dưới Node 24; lint còn 1 warning PostCSS không error.
- Không ghi giá trị `.env`, secret, cookie, database URL hoặc dữ liệu gia phả thật.
