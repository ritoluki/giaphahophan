import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const distDir = process.env.PLAYWRIGHT_DIST_DIR ?? ".next";
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PLAYWRIGHT_PORT must be a valid unprivileged TCP port");
if (!/^\.next(?:-[a-z0-9-]+)?$/i.test(distDir)) throw new Error("PLAYWRIGHT_DIST_DIR must be a .next-prefixed directory name");
const appDir = path.resolve("apps/web");
const standaloneDir = path.join(appDir, distDir, "standalone", "apps", "web");
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "reports/playwright", open: "never" }]],
  use: {
    baseURL: origin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: "node --env-file-if-exists=../../../../.env.local server.js",
    cwd: standaloneDir,
    url: origin,
    timeout: 120_000,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1" && !process.env.CI,
    env: { PORT: String(port), HOSTNAME: "127.0.0.1" }
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
    { name: "mobile-320", use: { ...devices["Pixel 5"], viewport: { width: 320, height: 844 } } }
  ]
});
