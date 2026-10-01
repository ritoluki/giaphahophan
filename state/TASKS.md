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
| M03-05 | P3 | Sửa có version | M03-04 | IN_PROGRESS - GET exposes version; PATCH If-Match/idempotency creates correction proposal; local API/DB/auth tests PASS; conflict diff and full mobile/a11y evidence NOT_RUN |
| M03-06 | P3 | Xóa có tác động | M03-05 | IN_PROGRESS - impact preview and DELETE If-Match proposal; atomic person/edge soft-delete keeps facts/sources for separate erasure; local DB/BFF/UI tests PASS; axe/manual/real-device NOT_RUN |
| M04-01 | P4 | Các chế độ cây | M03-06, M06-04 | IN_PROGRESS - ancestor/descendant/family/roots modes, union/adoption/disputed labels, bounded projection and mobile/fullscreen UI implemented; local DB/domain/contract/build/E2E PASS; axe/manual/real-device/remote CI NOT_RUN |
| M04-02 | P4 | Pedigree collapse | M04-01 | IN_PROGRESS - canonical person grouping preserves distinct occurrence IDs, default collapsed UI and explicit expand-to-occurrences control; domain/build/E2E PASS; axe/manual/real-device/remote CI NOT_RUN |
| M04-03 | P4 | Giới hạn và expand | M04-02 | IN_PROGRESS - mobile cap 120 and desktop cap 300 enforced per request; truncated graph carries bounded nextExpansion and UI action; local DB/contract/domain/build/E2E PASS; axe/manual/real-device/remote CI NOT_RUN |
| M04-04 | P4 | Mobile/keyboard | M04-03 | IN_PROGRESS - family-list mobile equivalent, zoom in/out/reset, Escape exit, focus return and fullscreen body-scroll lock implemented; full tests/build/lint and responsive E2E PASS; axe/manual/real-device/remote CI NOT_RUN |
| M04-05 | P4 | Cycle concurrency | M04-04 | IN_PROGRESS - concurrent inverse parent mutations are serialized by transaction advisory lock; one winner and one ANCESTRY_CYCLE rejection persist exactly one edge; local DB/API regression PASS; no new UI mutation surface, existing M04 states retained; axe/manual/real-device/remote CI NOT_RUN |
| M04-06 | P4 | Đời tương đối | M04-05 | IN_PROGRESS - generation is root/path-relative per occurrence (ancestor negative, root 0, descendant positive, union-only lineage unknown); canonical collapse preserves generation set/range; DB/domain/contract/build and responsive E2E PASS; axe/manual/real-device/remote CI NOT_RUN |
| M05-01 | P4 | Path có quyền | M04-06 | IN_PROGRESS — domain BFS/RPC/BFF/UI + local regression and responsive E2E 27/27 PASS; axe/manual/real-device/remote CI NOT_RUN |
| M05-02 | P4 | Semantics quan hệ | M05-01 | IN_PROGRESS — biological/adoptive/guardian/step/union explicit, disputed excluded; DB/domain/contract/build/E2E 27/27 PASS; axe/manual/real-device/remote CI NOT_RUN |
| M05-03 | P4 | Giới hạn rõ | M05-02 | IN_PROGRESS — max 12/10k/500ms và limit_reached/truncated DB boundary; domain/DB/UI tests PASS; axe/manual/real-device/remote CI NOT_RUN |
| M05-04 | P4 | Xưng hô thận trọng | M05-03 | IN_PROGRESS — direct biological/adoptive reviewed_rule; ambiguous paths descriptive_only; DB/domain/UI/E2E 27/27 PASS; axe/manual/real-device/remote CI NOT_RUN |
| M06-01 | P3 | Tên có và không dấu | M03-06 | IN_PROGRESS — canonical/alias search domain + indexed authorized RPC + BFF/UI implemented; DB/API/domain/contract/typecheck/build/lint and responsive E2E 30/30 PASS; axe/manual/real-device/remote CI NOT_RUN |
| M06-02 | P3 | Filter và cursor | M06-01 | IN_PROGRESS — branch/status/birth-year filters and opaque keyset cursor implemented in authorized RPC/BFF/UI; DB/API/domain/contract/typecheck/build/lint and responsive E2E 33/33 PASS; axe/manual/real-device/remote CI NOT_RUN |
| M06-03 | P3 | Không lộ metadata | M06-02 | IN_PROGRESS — strict allowlisted search projection and hidden-metadata regression PASS; DB/API/full unit/typecheck/build/lint PASS; axe/manual/real-device/remote CI NOT_RUN |
| M06-04 | P3 | Tải lớn | M06-03 | IN_PROGRESS — 10k synthetic benchmark p95 75.19ms; BFF page cap/index and client debounce+AbortController+sequence guard implemented; full tests/build/lint and Playwright 33/33 PASS; axe/manual/real-device/remote CI NOT_RUN |
| M07-01 | P2 | Invitation | CORE-01 | IN_PROGRESS — migrations 0021-0022, idempotent create/accept BFF, redacted mobile UI and synthetic local core acceptance PASS; email provider/H2, staging, remote CI and full accessibility/real-device gates remain NOT_RUN |
| M07-02 | P2 | Session và logout | M07-01 | IN_PROGRESS — refresh/SSR cookie, global revoke, sensitive action denial and idempotent empty state PASS local; remote/a11y/real-device NOT_RUN |
| M07-03 | P2 | MFA đặc quyền | M07-02 | IN_PROGRESS — migration 0023 direct DB MFA guard, BFF MFA lifecycle, restricted mobile setup and synthetic aal2 acceptance PASS; staging/remote CI/axe/manual/real-device NOT_RUN |
| M07-04 | P2 | Membership và owner | M07-03 |  |
| M07-05 | P2 | Recovery và claim | M07-04 |  |
| M08-01 | P3 | Đề nghị có nguồn | M03-06, M07-05 |  |
| M08-02 | P3 | Diff và conflict | M08-01 |  |
| M08-03 | P3 | Approve atomic | M08-02 |  |
| M08-04 | P3 | Scope và 2 người | M08-03 |  |
| M08-05 | P3 | Lifecycle rõ | M08-04 |  |
| M09-01 | P5 | Upload an toàn | CORE-02, JOBS-01 |  |
| M09-02 | P5 | Original và derivative | M09-01 |  |
| M09-03 | P5 | Citation thật | M09-02 | IN_PROGRESS - local source/citation API, exact-one target, idempotency and real FK PASS; staging/remote/accessibility gates NOT_RUN |
| M09-04 | P5 | Quyền liên kết | M09-03 | IN_PROGRESS - private asset to public revision link cannot escalate visibility; local DB/API/BFF PASS; staging/remote/accessibility gates NOT_RUN |
| M09-05 | P5 | Viewer mobile | M09-04 | IN_PROGRESS - image/PDF/audio/video viewer, safe fallback/no autoplay, responsive Playwright 54/54 PASS; staging/remote/axe/real-device NOT_RUN |
| M10-01 | P6 | Adapter Việt Nam | M03-06, M09-05 | IN_PROGRESS — adapter 1900–2099, 44 golden dates, independent comparison and round-trip/invalid tests PASS; release/accessibility gates remain NOT_RUN |
| M10-02 | P6 | Recurrence policy | M10-01 | IN_PROGRESS — leap/short-month policies and unreviewed leap-source gate PASS; release/accessibility gates remain NOT_RUN |
| M10-03 | P6 | Ngày gốc và lần tới | M10-02 | IN_PROGRESS — occurrencesBetween crosses lunar/solar year boundary, preserves logical keys and source rule; release/accessibility gates remain NOT_RUN |
| M10-04 | P6 | Override/version | M10-03 | IN_PROGRESS — override preserves logical key/id, records reason/version and dedupes rule updates; release/accessibility gates remain NOT_RUN |
| M10-05 | P6 | RSVP | M10-04 | IN_PROGRESS — RSVP schema/domain mutation supports yes/no/maybe, bounded headcount/note, idempotent replay/conflict, optimistic versioning and private projections; 4/4 contract + 6/6 domain tests PASS; release/staging/UI gates remain NOT_RUN |
| M10-06 | P6 | ICS đúng ngày | M10-05 | IN_PROGRESS — scoped ICS exporter uses solar all-day dates, exclusive DTEND, stable UID, version-derived SEQUENCE and no public feed; 3/3 contract + 5/5 domain tests PASS; release/staging/UI gates remain NOT_RUN |
| M11-01 | P6 | Outbox atomic | M10-06, JOBS-01 | IN_PROGRESS — migration 0009 and worker dispatcher provide atomic outbox durability, least-privilege claim/lease/retry and deduped publish; local DB/jobs/worker tests PASS; release/staging gates remain NOT_RUN |
| M11-02 | P6 | Gửi idempotent | M11-01 | IN_PROGRESS — delivery attempts persist provider message ID, reconcile before retry and enforce channel/key uniqueness; local SQL/worker/contract tests PASS; real provider and release gates remain NOT_RUN |
| M11-03 | P6 | Privacy và preference | M11-02 | IN_PROGRESS — send-time policy enforces opt-in, quiet/default hour, unsubscribe/suppression and consent recheck; worker 4/4 + contract 2/2 tests PASS; provider/UI/release gates remain NOT_RUN |
| M11-04 | P6 | Counters và failure | M11-03 | IN_PROGRESS — job ledger phân biệt queued/processed/succeeded/failed/skipped, lưu failure audit, giới hạn retry và tổng hợp counters; worker 5/5 + contract 2/2 tests PASS; release/provider gates remain NOT_RUN |
| M12-01 | P6 | Rich text an toàn | M09-05, M08-05 | IN_PROGRESS — versioned AST allowlist, server sanitizer, DB body constraint, safe link/media renderer; contract 2/2 + domain 4/4 + local DB test PASS; revision/publish/release gates remain NOT_RUN |
| M12-02 | P6 | Revision/publish | M12-01 | IN_PROGRESS — draft/submitted/approved/published/archived workflow, scheduled projection, optimistic locks, no-index expiring preview grants, immutable published pointer/DB guard; contract 2/2 + domain 4/4 + local DB test PASS; API/editor/scheduler/release gates remain NOT_RUN |
| M12-03 | P6 | Public SEO | M12-02 | IN_PROGRESS — public published projection contract, fail-closed OG/metadata/sitemap, demo noindex robots and preview/restricted noindex article boundary; contract 2/2 + domain 4/4 + full build PASS; DB/API content integration and release gates remain NOT_RUN |
| M12-04 | P6 | Tìm đọc mobile | M12-03 | IN_PROGRESS — ordered news list/article reader, SafeRichText long content/image/heading layout, demo-only approved asset, explicit reader states and no-index unknown boundary; localhost smoke + full test/build PASS; axe/zoom/device/API/release gates remain NOT_RUN |
| M13-01 | P6 | Place/burial model | M09-05 | IN_PROGRESS — migration/domain/contracts/UI + synthetic local DB test PASS; API mutation, full accessibility/device, staging/remote and production gates remain NOT_RUN |
| M13-02 | P6 | Coordinates private | M13-01 | IN_PROGRESS — explicit provider URL contract/domain boundary and restricted CTA PASS; provider adapter/quota, API integration, accessibility/device, staging/remote and production gates remain NOT_RUN |
| M13-03 | P6 | Media và directions | M13-02 | IN_PROGRESS — place-scoped media links, directions visibility/projection, private DB boundary and mobile empty/text states PASS; staging/remote/axe/real-device/production gates NOT_RUN |
| M13-04 | P6 | Map adapter gate | M13-03 | IN_PROGRESS — server-only H2/provider gate, authorization-first URL decision and DB-backed atomic quota PASS; provider/H2/staging/remote/axe/real-device/production gates NOT_RUN |
| M14-01 | P7 | Balanced ledger | M07-05, M09-05 | IN_PROGRESS - local ledger/API foundation and /quy-ho demo PASS; M14-02 submit/approve routes now implemented; M14-03..05, staging/remote, accessibility/device and production gates remain NOT_RUN |
| M14-02 | P7 | 2-person post | M14-01 | IN_PROGRESS - DB RPC and BFF submit/approve implemented; grant + MFA + author separation + version + idempotency tested locally; staging/remote, accessibility/device and production gates remain NOT_RUN |
| M14-03 | P7 | Immutable/reversal | M14-02 | IN_PROGRESS - posted entry/lines immutable triggers, linked inverse-line reversal RPC, unique duplicate guard and reverse BFF route implemented; local M14-01..03 tests and full regression PASS; staging/remote, accessibility/device and production gates remain NOT_RUN |
| M14-04 | P7 | Reports và privacy | M14-03 | IN_PROGRESS - local report RPC/BFF projection, opening/receipt/payment/closing totals, restricted authorization and donor/proof omission PASS; full regression/build/typecheck/verify PASS; staging/remote, accessibility/device and production gates remain NOT_RUN |
| M14-05 | P7 | Đối chiếu kỳ | M14-04 | IN_PROGRESS - period reconciliation projection, immutable close snapshot, proof status and closed-period DB guard PASS locally; staging/remote, accessibility/device and production gates remain NOT_RUN |
| M15-01 | P7 | Chương trình/đề cử | M14-05 | IN_PROGRESS — migration 0044/0045, BFF/API, domain/contracts, `/khuyen-hoc` UI and local synthetic workflow PASS; staging/remote CI, axe/manual, real-device, cloud wiring and production approval NOT_RUN |
| M15-02 | P7 | Minors và nguồn | M15-01 | IN_PROGRESS — minor/guardian safeguard, restricted source evidence, independent story publication/review and redacted approved-story projection PASS locally; staging/remote CI, axe/manual, real-device, cloud wiring and production approval NOT_RUN |
| M15-03 | P7 | Award và thanh toán | M15-02 | IN_PROGRESS — award approval remains distinct from payment; posted journal links once, mark-paid replay is idempotent and reversal is reflected; local synthetic DB/API/BFF/contract/mobile UI/build evidence PASS; M14 ledger regressions PASS; staging/remote CI, axe/manual, real-device, cloud wiring and production approval NOT_RUN |
| M15-04 | P7 | Báo cáo | M15-03 | IN_PROGRESS — migration 0051, report contract/domain/BFF, permission-scoped applicant/donor counts, mobile admin report UI and approved/paid/reversed/net fixture PASS; staging/remote CI, axe/manual, real-device, cloud wiring and production approval NOT_RUN |
| M16-01 | P5 | Intake/dry-run | M03-06, M08-05, M09-05 | IN_PROGRESS — private staging, user-scoped storage checksum BFF, AAL2 grant path, SCR-32 UI, saved redacted preview GET and 57/57 desktop/mobile/320 E2E PASS; authenticated upload→import route integration, full a11y remain NOT_RUN |
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

M08-01 evidence (2026-09-27): PASS locally on synthetic Supabase. Proposal submit context and detail projection are authorization-gated; form supports sourced addition, correction and parent-link relationship proposals; tracking code is persisted; canonical person/relationship counts remain unchanged before approval. `pnpm run test:m08:proposal`, `pnpm test:auth`, `pnpm test:db`, full tests, typecheck, build, verify and Playwright 51/51 pass. M08-02 Diff/conflict, M08-03 atomic approve, M08-04 scope/two-person and M08-05 lifecycle remain TODO.
M08-02 evidence (2026-09-27): PASS locally on synthetic Supabase. Authorized diff projection exposes base/current/proposed with person field allowlist; UI renders three-way comparison and stale warning; authenticated MFA review of a stale proposal returned HTTP 409 and preserved canonical external update plus submitted proposal. pnpm run test:m08:proposal, pnpm test:auth, pnpm test:db, full pnpm test, typecheck, lint, build, verify, OpenAPI parse and Playwright 51/51 pass. M08-03 atomic approve, M08-04 scope/two-person and M08-05 lifecycle remain TODO; production approval and real data remain unavailable.

M08-03 evidence (2026-09-27): PASS locally on synthetic Supabase. Person addition approval now creates canonical target and attaches it to the proposal item atomically with status, review decision, audit and outbox; same idempotency key replay does not duplicate. Correction, relationship, stale conflict and soft-delete regressions remain PASS. pnpm test:db, pnpm test:auth, full pnpm test, typecheck, lint, build and standalone artifact auth pass; M08-04 scope/two-person and M08-05 lifecycle remain TODO.

M08-04 evidence (2026-09-27): PASS locally on synthetic Supabase. Branch-scoped reviewer grant outside the proposal branch returned HTTP 403; correct-scope reviewer required MFA and proposal authors remained unable to self-review. M08-05 lifecycle remains TODO; production approval and real data remain unavailable.


M10-01 evidence (2026-09-28): packages/lunar now exposes the strict Vietnam UTC+7 adapter over @dqcai/vn-lunar@1.0.1; 44 golden dates match independent @baostudio/viet-lunar@0.1.1, with leap-month/month-length validation and round-trip tests. pnpm --filter @phan/lunar test PASS (4/4); full pnpm test PASS (contracts 20/20, domain 24/24, worker 5/5, lunar 4/4, web 3/3), typecheck/lint/build/verify PASS on Node 24.21.0. Package-only slice; no UI/DB/API change. Staging/remote CI, axe/manual, real-device and production approval remain NOT_RUN.

M10-02 evidence (2026-09-28): packages/domain/src/m10.ts adds deterministic annual lunar recurrence planning over the verified adapter: four leap policies, four short-month policies, source leap review gate, safe skip/block outcomes and no Gregorian 365-day or JavaScript Date substitution. m10.test.ts 6/6 PASS; full pnpm test PASS (contracts 20/20, domain 30/30, worker 5/5, lunar 4/4, web 3/3), typecheck/lint/build/verify PASS on Node 24.21.0. Domain-only slice; no UI/DB/API change. Staging/remote CI, axe/manual, real-device and production approval remain NOT_RUN.

M10-03 evidence (2026-09-28): occurrencesBetween now checks lunar years Y−1/Y/Y+1 around a solar query range, filters solar occurrences, preserves EventRule source identity and stable logical keys, and supports once/annual-solar without replacing the source rule. Six M10-03 tests PASS; full pnpm test PASS (contracts 20/20, domain 36/36, worker 5/5, lunar 4/4, web 3/3), typecheck/lint/build/verify PASS on Node 24.21.0. Domain-only slice; no UI/DB/API change. Staging/remote CI, axe/manual, real-device and production approval remain NOT_RUN.

M10-04 evidence (2026-09-28): occurrence overrides now preserve logical key and id, validate supported date/reason/approver/monotonic version, and attach override reason/version; rule updates dedupe by logical key and select newest rule version. Three M10-04 tests PASS; full pnpm test PASS (contracts 20/20, domain 39/39, worker 5/5, lunar 4/4, web 3/3), typecheck/lint/build/verify PASS on Node 24.21.0. Domain-only slice; no UI/DB/API change. Staging/remote CI, axe/manual, real-device and production approval remain NOT_RUN.
- M10-05 evidence: bounded RSVP contracts and private domain mutation with idempotency/optimistic versioning; contracts 24/24, domain 45/45, worker 5/5, lunar 4/4, web 3/3, typecheck/lint/build/verify PASS on Node 24.21.0. No UI/DB/API surface changed; staging/remote CI, axe/manual, real-device and production approval remain NOT_RUN.
- M10-06 evidence: scoped ICS export has deterministic solar date output, exclusive DTEND, stable UID, cancellation/version handling and privacy denial; contracts 3/3, domain 5/5, full tests/typecheck/lint/build/verify PASS on Node 24.21.0. No UI/DB/API surface changed; staging, remote CI, axe/manual, real-device and production approval remain NOT_RUN.
- M11-01 evidence: local Supabase proves service_role-only outbox claim, retry after failure/lease and exactly-once publish transition; core DB mutation tests prove audit/outbox transaction evidence; worker tests 5/5 and typecheck PASS. pnpm test:auth was FAIL (BFF login 401) in the existing auth harness, separate from JOBS-01; staging/remote CI, axe/manual, real-device and production approval remain NOT_RUN.
- M11-02 evidence: provider acceptance is reconciled by stable idempotency key before a second send; provider ID is persisted, duplicate local keys are rejected and missing provider IDs after acceptance are invalid. SQL 1/1, worker 4/4, contract 2/2 and full regression PASS; no real provider/email was used.
- M11-03 evidence: preference policy suppresses non-opted-in, quiet-hour, unsubscribed, suppressed and revoked-consent sends; permitted sends require current consent at dispatch time. Worker 4/4, contract 2/2 and full regression PASS; no real provider/email or UI changed.
