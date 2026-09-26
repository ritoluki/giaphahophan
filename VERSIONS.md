# Chính sách phiên bản và dependency

## P0 resolution — 26/09/2026, local Windows

Đây là kết quả pin thực tế của scaffold, không phải cam kết môi trường production. Lockfile là `pnpm-lock.yaml`; install dùng `pnpm@12.6.0` với store/cache trong workspace. Nguồn package/changelog/advisory đã kiểm tra qua registry chính thức, tài liệu Context7 chính thức của Next.js và `pnpm audit`.

| Package | Exact pin | License/source | Peer/runtime note | Advisory result |
|---|---:|---|---|---|
| Node.js | 24.x required by manifest/CI; local `22.13.0` | [nodejs.org](https://nodejs.org/) | Local engine gate remains BLOCKED | N/A |
| pnpm | 12.6.0 | [pnpm.io](https://pnpm.io/) | workspace + frozen lockfile | PASS |
| Next.js / eslint-config-next | 16.3.3 / 16.3.1 | MIT; [Next docs](https://nextjs.org/docs) | App Router, standalone output, Node 24 CI | PASS after upgrading from 16.3.1; no known vulnerabilities |
| React / React DOM | 19.2.0 / 19.2.0 | MIT; [react.dev](https://react.dev/) | Next peer-compatible pair | PASS |
| TypeScript | 5.9.2 | Apache-2.0; [typescriptlang.org](https://www.typescriptlang.org/) | strict + noUncheckedIndexedAccess | PASS |
| Tailwind CSS / PostCSS | 4.1.13 / 4.1.13 | MIT; [tailwindcss.com](https://tailwindcss.com/) | CSS-first tokens; oxide build explicitly approved | PASS |
| Supabase SSR / JS | 0.7.0 / 2.57.0 | MIT; [supabase.com/docs](https://supabase.com/docs) | Auth/DB integration not executed until Docker is available | NOT_RUN |
| Vitest | 4.1.11 | MIT; [vitest.dev](https://vitest.dev/) | Node 24 CI baseline; local unit run passes | PASS; upgraded from vulnerable 3.2.6 |
| Playwright | 1.55.1 | Apache-2.0; [playwright.dev](https://playwright.dev/) | Browser download/E2E not run | PASS audit |
| Zod | 4.1.5 | MIT; [zod.dev](https://zod.dev/) | Runtime boundary schemas | PASS |
| fast-check / jsdom / tsx | 4.3.0 / 26.1.0 / 4.19.2 | OSS licenses recorded by lockfile | Domain/property and worker tooling | PASS audit |

Security repair record: initial audit found critical Next/Vitest and high Playwright advisories. Pins were updated to Next 16.3.3, Vitest 4.1.11, Playwright 1.55.1 and workspace override `esbuild=0.25.0`; final `pnpm audit --audit-level high` and `--audit-level moderate` both exited 0 with “No known vulnerabilities found”. `eslint@9.35.0` emitted a registry deprecation warning; it is not an advisory and remains pinned pending a compatible Next ESLint upgrade.

Ngày tham khảo tài liệu: 26/09/2026. Đây là **baseline để agent resolve**, không phải package-lock đã được tạo hoặc một cam kết các bản vá chưa kiểm tra tương thích.

| Thành phần | Quyết định | Gate trước khi dùng |
|---|---|---|
| Node.js | Nhánh 24 LTS [S05] | Chốt patch đang được hỗ trợ; dev/CI/container cùng major và patch |
| Next.js | Nhánh stable 16.3.x [S04] | Kiểm tra security advisory mới; dùng bản vá đã sửa lỗi; không beta/canary |
| React / React DOM | Stable tương thích peer dependencies của Next | Cùng version, render/hydration test |
| TypeScript | Stable tương thích Next và tooling | strict, noUncheckedIndexedAccess; compile cả worker/contracts |
| pnpm | Stable hỗ trợ Node 24; ưu tiên bản đang cài nếu tương thích | Ghi chính xác `packageManager`, commit pnpm-lock.yaml; không trộn npm/yarn lock |
| Supabase CLI | Bản stable tương thích local stack | Cài devDependency; duyệt postinstall chỉ gói cần thiết [S13] |
| Supabase JS/SSR | Stable, theo hướng dẫn SSR hiện hành [S07] | Test refresh cookie, logout, getUser cho tác vụ nhạy cảm, không cache chéo người |
| PostgreSQL | Major do Supabase project đã chọn hỗ trợ; dự kiến 17 | Đối chiếu local/hosted/backup client; không giả định extension có sẵn |
| Tailwind CSS | 4.x stable [S17] | Design tokens CSS-first, không copy cấu hình v3 nguyên trạng |
| shadcn/ui + Radix | Component được sinh và lưu trong repo | Pin CLI khi generate, không nhập đồng thời hai hệ primitives; Việt hóa và audit |
| React Flow / ELK | @xyflow/react stable + elkjs stable | License OSS, worker layout, large graph và keyboard tests [S10][S11] |
| pg-boss | Stable hỗ trợ Node/PostgreSQL đã chọn [S14] | Spike migration/schema/role/session pool, không cho runtime tạo DDL |
| Lunar adapter | @dqcai/vn-lunar là ứng viên mặc định [S16] | Verify source/license/round-trip/golden tests trước chốt; không tin tuyên bố độ chính xác của README |
| Vitest / Playwright / axe | Stable đã kiểm tra với Node 24 | Pin browser image đúng version Playwright [S21] |
| Email / monitoring | Resend, Sentry SDK tùy theo gate tài khoản | Tắt body/name/session replay mặc định; local không gửi thật |

## Agent phải hoàn thiện tại P0

Với từng package: ghi exact version, URL nguồn/changelog/advisory, thời điểm kiểm tra, Node/peer range, license, lý do chọn. Ghi cả Docker image digest và browser revision. `UNRESOLVED` là trạng thái ban đầu hợp lệ; không được giữ khi đóng P0.

Thực hiện install một lần theo manifest đã thống nhất; CI dùng frozen lockfile. Sửa major cần ADR. Bản vá bảo mật được ưu tiên nhưng phải chạy regression. Không downgrade để né lỗi nếu làm mất bản vá bảo mật.
