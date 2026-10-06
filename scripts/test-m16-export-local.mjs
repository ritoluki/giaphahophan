import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const baseline = readFileSync(resolve(root, "supabase/tests/m16_export_jobs.sql"), "utf8");
if (!/rollback;\s*$/i.test(baseline)) throw new Error("Export fixture must rollback");
const projection = readFileSync(resolve(root, "supabase/tests/m16_export_projection.sql"), "utf8");
const cancellation = readFileSync(resolve(root, "supabase/tests/m16_export_cancel.sql"), "utf8");
const context = readFileSync(resolve(root, "supabase/tests/m16_export_context.sql"), "utf8");
const worker = readFileSync(resolve(root, "supabase/tests/m16_export_worker.sql"), "utf8");
const sql = baseline.replace(/rollback;\s*$/i, () => `${projection}\n${cancellation}\n${context}\n${worker}\nrollback;`);
const result = spawnSync("docker.exe", ["exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql, encoding: "utf8", cwd: root, windowsHide: true });
if (result.status !== 0) {
  if (result.stdout) process.stderr.write(result.stdout);
  process.stderr.write(result.stderr || "Export fixture failed\n");
  process.exit(result.status ?? 1);
}
console.log("PASS local M16-06 metadata/projection/cancel/worker RPC: live session and current AAL/capability/membership/policy rechecks, lease claim/projection, bounded artifact manifest, exact completion, exact-session download manifest/storage policy (second live session denied), cancellation race cleanup, request/cleanup outbox, anonymous/authenticated worker RPC denial, and revoked-session/AAL-downgrade/capability-revocation/policy-change fail-closed. File bytes/Storage upload-download are covered by test:m16:export-worker; renderers remain NOT_RUN. Synthetic transaction rolled back.");
