import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const sql = readFileSync(resolve(root, "supabase/tests/m15_program_application.sql"), "utf8");
const result = spawnSync("docker.exe", ["exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { cwd: root, input: sql, encoding: "utf8", windowsHide: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || "local M15 program/application SQL failed\n");
  process.exit(result.status ?? 1);
}
console.log("PASS local M15-01/02: scoped programs, private evidence, idempotent application, reviewer MFA workflow, guardian safeguard and independently approved story projection");