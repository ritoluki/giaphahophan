# Automated accessibility scan — local demo

Date: 2026-10-06  
Environment: local Next.js demo at `http://127.0.0.1:3100`, local Supabase-backed fictional demo content, Windows/Chromium. No hosted Supabase, real genealogy data, or production environment was used.

## Result

`pnpm.cmd test:a11y` — **PASS, 14/14**. axe-core 4.13.0 (MPL-2.0) ran WCAG 2.0 A/AA, WCAG 2.1 A/AA and WCAG 2.2 AA tagged rules on five public routes (`/`, `/tra-cuu`, `/gia-pha`, `/lich-ho`, `/tu-lieu`) and two unauthenticated restricted admin routes (`/quan-tri/xuat-lieu`, `/quan-tri/nhap-lieu`), at desktop Chromium and a 320px viewport. Zero violations were reported by the selected automated rules.

The test reuses the already-running loopback-only demo and fails `BLOCKED` if it is unavailable; it does not start the Playwright config's standalone server or load `.env.local`. Typecheck passed. Workspace lint passed with 0 errors and 2 existing unrelated warnings (`postcss.config.mjs`, `mfa-setup.tsx`).

## Limits / remaining work

This is not a complete WCAG conformance claim. Automated axe rules do not replace keyboard-only review of every flow, screen-reader checks (VoiceOver/TalkBack), zoom/reflow review, contrast inspection for image overlays, authenticated/restricted/error states, or real-device testing. Those broader acceptance gates remain **NOT_RUN**. No design direction or approved asset was changed.

The first parallel scan attempt timed out under six simultaneous Chromium workers (4 timeout failures, not accessibility violations). The same initial 10 checks were rerun serially and passed; the current 14-check suite also passes serially. The runner uses one worker to avoid overloading the local demo.
