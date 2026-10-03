# M16-04 relationship preflight — 2026-10-04

Local Node24.21.0, pnpm12.6.0, Vitest4.1.11; synthetic fixtures only. No DB/API/UI canonical relationship write added by this slice.

PASS `pnpm.cmd --filter @phan/domain test`:103 tests including7 new preflight tests. Tested union grouping with no invented parents/sex; explicit kind/status/reason and snapshot/version; absent/excluded/duplicate external identities; cycle across families; disputed/guardian ancestry exclusion; duplicate links, biological-parent cap, self-parent, duplicate family and bounded total work. Existing source records including unmapped SOUR are retained at parser boundary; preflight only selects relationship fields and never interprets notes.

PASS workspace typecheck/lint (0errors,2existing warnings). Previous inspector build/browser/SQL evidence remains in M16_ROW_INSPECTION.md; it does not prove relationship persistence/apply.

Final full workspace tests PASS contracts65/domain103/worker18/lunar4/web6; config/UI have no tests. Contract reconciliation initially FAILed on duplicate OpenAPI/type declarations; removed the repeated definitions and reran parse/typecheck. No package/dependency added and no approved visual asset changed.

IN_PROGRESS: source/decision persistence, authorized mapping UI and atomic union/parent-link apply under ancestry lock, complete family-coverage checks and revalidation against existing canonical graph. Preflight valid means only supplied decisions pass domain rules, not that the import is ready. Existing scalar DB gate still rejects FAM/unresolved relationship rows. No owner approval required for subsequent synthetic implementation.
