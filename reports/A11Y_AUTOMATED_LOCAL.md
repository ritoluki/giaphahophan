# Automated accessibility scan — local demo

Date: 2026-10-06  
Environment: local Next.js demo at `http://127.0.0.1:3100`, local Supabase-backed fictional demo content, Windows/Chromium. No hosted Supabase, real genealogy data, or production environment was used.

## Result

`pnpm.cmd test:a11y` — **PASS, 92/92**. axe-core 4.13.0 (MPL-2.0) ran WCAG 2.0 A/AA, WCAG 2.1 A/AA and WCAG 2.2 AA tagged rules on 18 public/auth routes (including family, place, source, calendar, news, contribution, fundraising, education and account pages) and five unauthenticated restricted-admin routes, at desktop Chromium and a 320px viewport. Zero violations were reported by the 46 axe scans. Forty-six additional keyboard regressions verify Tab focuses the shared skip link, Enter navigates to `#main-content`, and focus moves to the main landmark on all 23 routes at both viewport profiles.

The test reuses the already-running loopback-only demo and fails `BLOCKED` if it is unavailable; it does not start the Playwright config's standalone server. Workspace unit tests (244) and TypeScript checks passed. Lint passed with 0 errors and 2 existing unrelated warnings (`postcss.config.mjs`, `mfa-setup.tsx`). An isolated Next standalone production build also PASSed for 55 routes with an explicit loopback Supabase endpoint and demo/test mode; the compiled artifact was verified to contain that loopback endpoint, and the generated `next-env.d.ts` reference was restored afterward.

## Limits / remaining work

This is not a complete WCAG conformance claim. The keyboard test covers skip navigation only, not every interactive flow. Screen-reader checks (VoiceOver/TalkBack), zoom/reflow review, contrast inspection for image overlays, authenticated/error states, and real-device testing remain **NOT_RUN**. No design direction or approved asset was changed.

The first parallel scan attempt timed out under six simultaneous Chromium workers (4 timeout failures, not accessibility violations). The earlier initial scans were rerun serially; the current 92-check suite passes serially. The runner uses one worker to avoid overloading the local demo.
