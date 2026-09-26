import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const required = [
  "package.json",
  "pnpm-workspace.yaml",
  "apps/web/package.json",
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/globals.css",
  "apps/worker/src/index.ts",
  "packages/domain/src/index.ts",
  "packages/contracts/src/index.ts",
  "supabase/migrations/0001_foundation.sql",
  "design/approved-assets/design-system-reference.png"
];
const missing = required.filter((file) => !existsSync(resolve(root, file)));
if (missing.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", missing }, null, 2));
  process.exitCode = 1;
} else {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  console.log(JSON.stringify({ status: "PASS", check: "foundation-files", packageManager: packageJson.packageManager, dataMode: "demo-only-by-default" }, null, 2));
}
