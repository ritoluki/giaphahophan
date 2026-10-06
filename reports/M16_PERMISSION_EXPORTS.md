# M16-06 permission-bound exports

## Accessibility regression slice — 2026-10-06

The export workspace sets `aria-busy` while authorized scope/job/preview reads are loading. An isolated standalone build at `.next-m16-export-a11y` and `tests/e2e/m16-export-restricted.spec.ts` verified the anonymous 320px state exposes the named workspace and sign-in action, but no format form, private preview, or download control, and has no horizontal overflow. Playwright: 1/1 PASS; isolated production build: 55 routes PASS. Workspace tests: contracts75/domain128/worker24/lunar4/web6 PASS; typecheck and verify PASS; lint 0 errors/2 pre-existing warnings. A worker test-double call missing its required synthetic workerId was corrected, discovered by the workspace typecheck.

This narrow check is not a full axe/manual accessibility audit, authenticated download authorization, or proof of live worker/RPC/Storage behavior. PDF/SVG renderer and production/release gates remain open; M16-06 remains IN_PROGRESS.

Fresh local regression after this UI change: `pnpm.cmd test:m16:export` PASS against local Docker. It rechecked queued/replay/hash-media conflict, MFA/personal claim, quota/expiry/policy/revocation, private projection redactions/consent withdrawal and cancellation denial/replay; the synthetic transaction rolled back. The test explicitly reports rendering/download NOT_RUN.

## Local authorization fixture recheck — 2026-10-06

PASS `pnpm.cmd test:m16:export` under authorized local Docker execution; existing metadata/projection/cancel SQL fixture passed and rolled back. Local Supabase CLI returned generated service-role/API/DB values transiently; values were withheld and not saved. No owner env needed for one-shot tests. A proposed persistent worker migration was rejected by auto-review before file creation; no database security change was made. See `state/HUMAN_ACTIONS.md` for the exact owner approval request.

## Worker orchestration boundary — 2026-10-06

Added `apps/worker/src/export-processor.ts`: a lease-oriented processor validates the job and freshly returned authorized projection, serializes JSON/CSV/GEDCOM formats, creates deterministic tree/job-only private object paths and SHA-256 metadata, and conditionally completes only through an authorization-aware store port. It tracks object paths before remote writes (to clean up ambiguous write timeouts), removes artifacts if cancellation/lease loss wins, and never overwrites a terminal state when failure recording loses the lease. PDF/SVG renderer absence is a typed failure, never fake success. Added 6 worker orchestration tests for sidecar/hash/path, context mismatch, cancellation race, uncertain upload, lease loss, and unsupported PDF.

PASS worker tests24/24 (full worker suite), workspace tests contracts75/domain128/worker24/lunar4/web6, typecheck, lint0 errors/2 existing warnings, verify and diff check. These are port/orchestration tests with explicit in-memory test doubles only. No live database adapter, service-role RPC, pg-boss claim, Storage upload, download authorization or PDF/SVG renderer is implemented or evidenced; M16-06 stays IN_PROGRESS.

## GEDCOM projection serializer — 2026-10-06

PASS domain-only `serializeExportGedcom551/7` for validated, already permission-filtered projections. Stable file-local opaque xrefs; supported INDI/FAM/name/fact/source/citation subset; 5.5.1 line wrapping with CONC; GEDCOM 7 CONT and initial-@ escaping; Julian date syntax without invented precision; unsupported/lunar fields preserved in a full filtered canonical JSON sidecar with explicit warnings. HUSB/WIFE are structural slots, not gender inference. The serializer does not fetch projections, execute jobs, write artifacts, create ZIPs, or authorize downloads.

PASS focused serializer tests24/24 and domain typecheck; PASS workspace tests contracts75/domain128/worker18/lunar4/web6, full typecheck, lint0 errors/2 pre-existing warnings, verify, isolated standalone Next production build55 routes. All local synthetic. NOT_RUN GEDCOM validator/vendor interoperability, job worker/RPC authorization, private artifact/manifest, ZIP, rechecked download, full accessibility/device/staging/production. M16-06 remains IN_PROGRESS; no real data/hosted mutation/deployment.

## SCR-33 form/cache continuation — 2026-10-06 (supersedes older dependency/draft blocker notes)

Installed pinned MIT dependencies: `react-hook-form@7.62.0`, `@hookform/resolvers@5.2.1`, `@tanstack/react-query@5.87.1`; Zod remains the form/edge schema. Create/cancel form state uses RHF + resolver; reads/mutations use a page-local QueryClient with no cross-workspace cache, retries disabled and cache cleared at unmount. Server reads remain `no-store` and validated at response boundaries.

Create-form draft is limited to sessionStorage in the current tab, expires after 15 minutes, validates strict schema, binds actor and authorized tree/scope, and retains the idempotency request signature/key only when its input still matches. It never stores CSRF or projected genealogy data; invalid/expired/foreign-scope drafts are deleted. Browser verified save → reload → restore → create → delete. Cancellation itself is not persisted as a local draft; server job bookmark remains the recovery path.

PASS current checks: `pnpm.cmd test` (contracts75/domain124/worker18/lunar4/web6), `pnpm.cmd typecheck`, `pnpm.cmd lint` (0 errors, 2 existing warnings), `pnpm.cmd verify`, `pnpm.cmd test:m16:export` (synthetic transaction rollback), isolated standalone Next build (55 routes) and complete `pnpm.cmd test:m16:http` on `localhost:3101` against local Supabase. Browser includes previous import/chunk/compensation suite plus export create/draft/reload/preview/cancel/reload/anonymous restricted at 320px. The earlier CORS failure was caused only by mixing `127.0.0.1` and `localhost` in this test; corrected the test origin, no product CORS widening. Screenshots recaptured and inspected: `reports/m16-export-320.png`, `reports/m16-export-cancelled-320.png`, `reports/m16-export-restricted-320.png`.

M16-06 remains IN_PROGRESS. Still open: queue worker completion/cancellation concurrency, private artifact generation and authorized downloads, GEDCOM export profile, PDF/SVG/book/media packages, representative/consent/publication workflow, full keyboard/axe/real-device/load/clean-install/staging and release approvals. Queue metadata is not a finished file. Local synthetic only; no hosted writes/real data/production deployment.

## Execution plan

SCR-33 slice plan: DB-authorized demo scope choices and current own jobs only, typed no-store context, shared AdminShell/form tokens, all approved format/audience/media choices, actual request/preview/cancel/reload with recoverable idempotency keys and URL job bookmark. Keep artifact/download unavailable until implemented; never label a queued job complete. Test authenticated 320px navigation/reload/actions and anonymous restricted state.

1. Preserve approved formats, audience/media choices and explicit personal/tree/branch scopes; implement strict request/job/projection contracts.
2. Serialize only DB-authorized projections. Test CSV formulas, Unicode/quotes/newlines, lossless JSON dates and hidden-endpoint/reference rejection.
3. Persist private queued jobs with session actor, independent approved personal claim or bulk capability+AAL2, policy version,24-hour expiry, audit, replay and atomic3/day quota.
4. Connect BFF guards and verify local authenticated HTTP; keep queued/artifact states truthful.
5. Next: policy-filtered projection, worker/private Storage, rechecked download/cancel, GEDCOM conformance+sidecar, PDF/SVG templates and mobile SCR-33. No item5 PASS inferred from metadata/serializer tests.

Cancellation slice plan: add strict baseVersion/reason contract and guarded BFF; serialize queued/running cancellation on the job row, bind retry to actor/job/version/reason digest independent of a caller-supplied hash, preserve canonical data and quota, invalidate preview, and test stale/terminal/permission/expiry/replay cases locally. Worker completion must honor the same row lock/status; cancellation is not deletion of source media or revocation of a previously completed download.

## Cancellation continuation — 2026-10-06

PASS local migration0073 + test:m16:export: queued/running cancellation persists with version increment, exact retry is actor/job/version/reason-digest-bound even when a caller reuses a counterfeit hash. Stale/terminal/AAL1/cross-actor/expired/revoked cases rejected; cancelled preview denied, rolling quota retained, audit not duplicated and canonical data retained. Cancellation-vs-worker concurrency remains NOT_RUN because worker completion is not implemented.

PASS test:m16:http on standalone .next-m16-export-cancel at localhost3100 + synthetic local Supabase: cancel/reload/exact retry, stale/changed409, CSRF/cross-actor/revoked/expired403, unknown actor400, preview invalidation and unchanged3-job quota. Existing import/family/chunk/1000-person two-person compensation regression PASS; cleanup verified. PASS workspace73/124/18/4/6,typecheck,lint0errors/2known warnings,verify/OpenAPI/state parse,diff check and isolated build.

M16-06 still IN_PROGRESS: SCR-33, worker/private artifact/download/render, GEDCOM/PDF/SVG/media packaging, public/representative/consent workflows and full accessibility/device/load/clean-install/staging/production remain open. Cancellation completes only the queued/running API/DB slice.

## SCR-33 context and mobile UI — 2026-10-06

PASS migration0074 and export SQL fixture on local rollback: DB-generated context returns only active demo scopes authorized by live MFA or independently reviewed personal claim; protected-minor scopes excluded. Expired/foreign jobs omitted, membership revocation removes scopes/jobs, and private purpose/grant/artifact fields absent. Exact Vietnamese labels tested. A Windows PowerShell native SQL pipe initially damaged Unicode; reapplied the same functions through Node UTF-8 stdin and reran assertions PASS.

PASS authenticated browser pnpm.cmd test:m16:http on standalone .next-m16-export-ui-final, localhost:3100/local Supabase: SCR-33 submits an actual queued DB job, shows all six approved formats, filters preview to one authorized synthetic person, cancels/reloads/bookmarks status, and disables preview/download after cancellation. Anonymous 320px state remains restricted; viewport overflow test PASS. Screenshots reports/m16-export-320.png, m16-export-cancelled-320.png, and m16-export-restricted-320.png inspected. An initial narrow flex header was corrected and retested.

PASS workspace tests: contracts74/domain124/worker18/lunar4/web6, typecheck, lint (0 errors/2 preexisting warnings), verify, OpenAPI parse, final isolated build55 pages. Existing import/chunk/compensation SQL/browser regressions and cleanup PASS. Shared AdminShell/logo/design tokens/style reused.

[SUPERSEDED 2026-10-06] At the time of this entry, React Hook Form/TanStack installation and draft recovery were blocked by the pnpm store lock. The later SCR-33 form/cache continuation at the top of this report resolves those two items; remaining gaps are listed there.

## Local evidence — 2026-10-06

PASS `pnpm.cmd test:m16:export`: migrations0070/0071 and synthetic PostgreSQL transaction verify durable queued/exact replay, changed body including counterfeit-hash/media choice refusal, bulk AAL1/member denial, personal scope requiring independent claim review, cross-tree/actor denial,3/day quota,24-hour expiry, policy change and membership revocation. No result asset/status complete manufactured; fixture rolls back. FORCE RLS, raw/anonymous grants closed; old incomplete create RPC revoked.

PASS `TEST_WEB_URL=http://localhost:3100 pnpm.cmd test:m16:http` against standalone `.next-m16-export` + local Supabase: queued DB/reload/replay, changed409,CSRF403,unknown override400,cross-actor403,quota429,expiry/revocation403, external format names and audience/media persistence. Existing atomic/family/chunk/two-person compensation regressions also PASS after shared Origin/CSRF/body-bound/idempotency/verified-session guard extraction. Synthetic cleanup verified. Earlier isolated dev3123 run also PASS; screenshots are UI evidence, not authorization evidence.

PASS workspace tests contracts72/domain123/worker18/lunar4/web6. Domain includes19 new cases: dangerous formula/C0/DEL cells or whitespace+BOM before markers are apostrophe-prefixed using pinned MIT Papa Parse5.5.3; JSON preserves original text. Quoting/Unicode/newlines, year-only/lunar-leap dates, empty headers, unknown-field rejection and hidden endpoint/citation-reference rejection verified. Serializer validation is not DB authorization. Date schema extracted unchanged after an initial circular-module failure; corrected regressions PASS.

PASS typecheck, lint0errors/2existing warnings, foundation verify, OpenAPI parse and isolated build `.next-m16-export`. Config/UI packages have no tests. First SQL fixture lacked required name_search; later anonymous-grant assertion accidentally targeted the temporary fixture helper; corrected and rerun PASS. First YAML check used an unavailable module; installed js-yaml4.3.2 successfully parsed the contract without a package addition.

NOT_RUN at the initial metadata slice: actual policy-filtered projection, worker/artifact Storage/render/download/cancel, GEDCOM export, PDF/SVG/book pagination/media packaging, SCR-33 UI, full manual accessibility/device/load, clean-install/staging and production gates. Projection evidence below supersedes only the projection item. M16-06 IN_PROGRESS; scope not reduced. Local synthetic data only; no hosted mutation/real data/production deployment.

## Authorized projection continuation — 2026-10-06

PASS migration0072 + `pnpm.cmd test:m16:export` on local PostgreSQL: restricted and protected-minor rows, hidden endpoints, private sources/quotes/provenance and unions with hidden participants are excluded. Living identity consent does not unlock aliases, sex, life status or facts; each field requires its own current consent. Withdrawing birth consent hides the date immediately; quarantining the restricted proof hides living identity. Approved personal scope remains available at AAL1, but a protected-minor personal claim fails closed. Raw consent tables/helpers remain inaccessible to clients. Public audience deliberately returns no people pending M02 publication integration, not a claim of completed public export.

PASS `TEST_WEB_URL=http://localhost:3100 pnpm.cmd test:m16:http` against standalone `.next-m16-export-projection` and local Supabase: restricted import rows produce an empty bulk projection; an independently seeded eligible person/fact/source/citation is returned, a year-only date remains year-only, raw quote/provenance markers are absent, cross-actor and expired preview return403. Import/chunk/compensation regressions and synthetic cleanup PASS. This is authenticated HTTP evidence, not just screenshots.

PASS workspace tests contracts72/domain124/worker18/lunar4/web6; domain adds explicit-union participant validation and preserves unknown family structure without inferring parents. Typecheck, lint0errors/2existing warnings, verify, OpenAPI parse, `git diff --check` and isolated final production build `.next-m16-export-projection-final` PASS (54 generated pages). Initial SQL fixture used an invalid media purpose; fixed within the existing purpose allowlist. SQL concatenation initially collapsed dollar-quoted blocks via replacement-string semantics; switched to a replacement callback and reran both import/export SQL fixtures PASS.

Remaining NOT_RUN: consent mutation/representative and public-person publication workflows, export worker/private artifacts/render/download/cancel, GEDCOM export/conformance sidecar, PDF/SVG/book pagination/media packaging, SCR-33 UI, full accessibility/device/load, clean-install/staging and production gates. No cloud mutation, real data or deployment. Evidence files: `supabase/tests/m16_export_projection.sql`, `scripts/test-m16-import-http-local.mjs`, `packages/domain/src/m16-export.test.ts`.
