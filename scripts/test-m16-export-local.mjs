import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const baseline = readFileSync(resolve(root, "supabase/tests/m16_export_jobs.sql"), "utf8");
if (!/rollback;\s*$/i.test(baseline)) throw new Error("Export fixture must rollback");
const projection = readFileSync(resolve(root, "supabase/tests/m16_export_projection.sql"), "utf8");
const cancellation = readFileSync(resolve(root, "supabase/tests/m16_export_cancel.sql"), "utf8");
const sql = baseline.replace(/rollback;\s*$/i, () => `${projection}\n${cancellation}\nrollback;`);
const result = spawnSync("docker.exe", ["exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql, encoding: "utf8", cwd: root, windowsHide: true });
if (result.status !== 0) { process.stderr.write(result.stderr || "Export fixture failed\n"); process.exit(result.status ?? 1); }
console.log("PASS local M16-06 metadata/projection/cancel: durable queued/replay/hash-media conflict,MFA/approved personal claim,quota/expiry/policy/revoke; restricted/minor/hidden endpoints/source/citation/alias/birth redaction,field consent/proof withdrawal,women/unions retained,personal scope; queued/running cancel exact retry,changed reason/version even same hash denied,stale/terminal/AAL1/cross-actor/expired/revoked denial,preview invalidation,no quota refund,no duplicate audit or canonical deletion. Public publication gate fail-closed; rendering/download NOT_RUN. Synthetic transaction rolled back.");
