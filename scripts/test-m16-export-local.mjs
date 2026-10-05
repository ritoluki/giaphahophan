import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const sql = readFileSync(resolve(root, "supabase/tests/m16_export_jobs.sql"), "utf8");
if (!/rollback;\s*$/i.test(sql)) throw new Error("Export fixture must rollback");
const result = spawnSync("docker.exe", ["exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql, encoding: "utf8", cwd: root, windowsHide: true });
if (result.status !== 0) { process.stderr.write(result.stderr || "Export fixture failed\n"); process.exit(result.status ?? 1); }
console.log("PASS local M16-06 job metadata: durable queued/replay, changed request conflict, bulk MFA/capability, approved personal scope, cross-tree/actor denial, quota, expiry, policy change and membership revocation. Rendering/download NOT_RUN. Synthetic transaction rolled back.");
