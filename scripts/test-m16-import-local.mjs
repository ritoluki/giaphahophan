import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const baseline = readFileSync(resolve(root, "supabase/tests/m16_import_staging.sql"), "utf8");
const chunks = readFileSync(resolve(root, "supabase/tests/m16_chunk_transactions.sql"), "utf8");
const compensation = readFileSync(resolve(root, "supabase/tests/m16_compensation.sql"), "utf8");
if (!/rollback;\s*$/i.test(baseline)) throw new Error("Synthetic fixture must end with rollback");
const sql = baseline.replace(/rollback;\s*$/i, `${chunks}\n${compensation}\nrollback;`);
const result = spawnSync("docker.exe", [
  "exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres",
  "-v", "ON_ERROR_STOP=1", "-f", "-"
], { cwd: root, input: sql, encoding: "utf8", windowsHide: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || "local M16 import staging fixture failed\n");
  process.exit(result.status ?? 1);
}
console.log("PASS local M16-01/02/04/05: staging/auth/atomic regressions;2501-person bounded chunk completion/replay,edit/collision rollback,partial cancellation,multi-family continuation;separate two-person compensation denies self/unapproved/AAL1 actions,later edits,new FK aliases and polymorphic proposal references;exact/changed retries,canonical removal with source/staging/stable IDs preserved. Synthetic transaction rolled back.");
