import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const baseline = readFileSync(resolve(root, "supabase/tests/m16_import_staging.sql"), "utf8");
const chunks = readFileSync(resolve(root, "supabase/tests/m16_chunk_transactions.sql"), "utf8");
if (!/rollback;\s*$/i.test(baseline)) throw new Error("Synthetic fixture must end with rollback");
const sql = baseline.replace(/rollback;\s*$/i, `${chunks}\nrollback;`);
const result = spawnSync("docker.exe", [
  "exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres",
  "-v", "ON_ERROR_STOP=1", "-f", "-"
], { cwd: root, input: sql, encoding: "utf8", windowsHide: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || "local M16 import staging fixture failed\n");
  process.exit(result.status ?? 1);
}
console.log("PASS local M16-01/02/04/05: staging/auth/atomic regressions; 2501-person bounded chunk completion and durable exact replay, changed/stale/AAL1/out-of-order denial, edit/collision rollback preserves earlier chunks, partial cancellation retains 500 people/source/manifest and blocks continuation, people-first multi-family graph continuation. Synthetic transaction rolled back.");
