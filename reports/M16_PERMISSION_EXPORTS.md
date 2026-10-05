# M16-06 permission-bound exports

## Execution plan

1. Preserve approved formats, audience/media choices and explicit personal/tree/branch scopes; implement strict request/job/projection contracts.
2. Serialize only DB-authorized projections. Test CSV formulas, Unicode/quotes/newlines, lossless JSON dates and hidden-endpoint/reference rejection.
3. Persist private queued jobs with session actor, independent approved personal claim or bulk capability+AAL2, policy version,24-hour expiry, audit, replay and atomic3/day quota.
4. Connect BFF guards and verify local authenticated HTTP; keep queued/artifact states truthful.
5. Next: policy-filtered projection, worker/private Storage, rechecked download/cancel, GEDCOM conformance+sidecar, PDF/SVG templates and mobile SCR-33. No item5 PASS inferred from metadata/serializer tests.

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
