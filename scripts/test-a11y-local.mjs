import { spawnSync } from "node:child_process";

const port = "3100";
const origin = `http://127.0.0.1:${port}`;

try {
  const response = await fetch(origin, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Demo server returned HTTP ${response.status}`);
} catch (error) {
  console.error(`BLOCKED: start the local demo on ${origin} before running the accessibility scan.`);
  console.error(error instanceof Error ? error.message : "Local server is unavailable");
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/a11y.spec.ts", "--project=desktop-chromium", "--project=mobile-320", "--workers=1"],
  {
    cwd: process.cwd(),
    env: { ...process.env, PLAYWRIGHT_PORT: port, PLAYWRIGHT_REUSE_SERVER: "1" },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
