import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sql = readFileSync(resolve(root, "supabase/tests/m05_kinship.sql"), "utf8");
const result = spawnSync("docker.exe", ["exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { cwd: root, input: sql, encoding: "utf8", windowsHide: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "local M05 kinship test failed\n");
  process.exitCode = 1;
} else {
  console.log("PASS local M05-01/M05-02 kinship: permission path, adoptive toggle, guardian/step semantics, disputed exclusion and hidden endpoint denial");
}