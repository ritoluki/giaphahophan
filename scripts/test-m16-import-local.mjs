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
console.log("PASS local M16-01: checksum-bound private intake, import capability, dry-run row counts, review flags, canonical projection unchanged and real-data mode denied");
