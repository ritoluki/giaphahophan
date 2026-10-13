# M07 MFA QR and signed-in feedback — local

2026-10-14. Scope: fictional local Auth only; no hosted writes, owner factor changes, screenshots, traces, or logged credentials.

Plan: reproduce the broken QR, normalize the SDK SVG data URI including XML prolog, keep manual secret hidden, support explicit restart of only unfinished app TOTP enrollment, clarify already-signed-in state, then verify actual browser/TOTP/session behavior before restarting the demo.

Root cause: the UI double-wrapped the SDK's SVG data URI. The provider also emits an XML prolog, which must be accepted without truncating the QR. Context7 official Supabase TOTP guidance informed direct image source handling and cleanup limited to unverified enrollment; verified factors remain provider-protected.

PASS: `pnpm.cmd --filter @phan/web test`, 18 tests across 7 files (Node24.21.0). `pnpm.cmd --filter @phan/web typecheck` passed. Lint: zero errors, two existing warnings (PostCSS default export, QR img).

FAIL during diagnosis: initial browser harness reloaded before client navigation had settled; synchronization corrected. Real provider QR exposed missing SVG prolog support; initial browser runs correctly failed and cleaned up synthetic users. No acceptance claim from those runs.

PASS actual browser acceptance: `node scripts/test-m07-mfa-browser-local.mjs` against isolated `.next-mfa-fix` build, local Supabase and Chromium320. Verified password cookie reload, signed-in feedback, rendered QR (naturalWidth >0), hidden manual secret, explicit replacement after reload, unrelated pending factor preservation, no horizontal overflow, real TOTP verification to AAL2, AAL2 persistence after reload, verified factor retention after another enroll request. Synthetic user/factors deleted in finally; no owner account modified. Build55 routes PASS. No full production or accessibility acceptance claim.

Provider detail found by actual test: XML declaration plus generated comment precede SVG. Normalizer handles both without double wrapping or unescaped hash fragments. Earlier failures are retained above rather than counted as PASS.

Live local demo replaced with tested artifact: PID25668, http://127.0.0.1:3100, ignored logs reports/local/demo-mfa-20261014. User should create a fresh pending enrollment because the previous secret appeared in their screenshot; no automatic owner-factor rotation was performed.
