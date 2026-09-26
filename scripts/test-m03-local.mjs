import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sql = readFileSync(resolve(root, "supabase/tests/m03_identity.sql"), "utf8");
const result = spawnSync(
  "docker.exe",
  ["exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
  { cwd: root, input: sql, encoding: "utf8", windowsHide: true },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "local M03-01 test failed\n");
  process.exitCode = 1;
} else {
  console.log("PASS local M03-01: stable UUID/code identity, duplicate names, aliases and restricted projection");
}
