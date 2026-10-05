import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const sql = readFileSync(resolve(root, "supabase/tests/m16_import_staging.sql"));
const result = spawnSync("docker.exe", [
  "exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres",
  "-v", "ON_ERROR_STOP=1", "-f", "-"
], { cwd: root, input: sql, encoding: "utf8", windowsHide: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || "local M16 import staging fixture failed\n");
  process.exit(result.status ?? 1);
}
console.log("PASS local M16-01/02/04: private staging, stable identities, independent MFA review, stale/tampered snapshot denial, reversible row exclusion with original preservation, per-family and whole-job relationship coverage, shared-lock guard denies proposed/existing-edge cycles and >2 confirmed biological parents, acyclic atomic apply creates people/unions/parent links/citations, exact replay creates no duplicates, graph revision updates, injected union collision rolls all writes back, scalar apply replay and changed-request denial, real-mode API/DB gate. Synthetic transaction rolled back.");
