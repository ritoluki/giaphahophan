import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sql = readFileSync(resolve(root, "supabase/tests/m06_search_load.sql"), "utf8");
const result = spawnSync("docker.exe", ["exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { cwd: root, input: sql, encoding: "utf8", windowsHide: true });
const output = (result.stdout || "") + (result.stderr || "");
if (result.status !== 0) {
  process.stderr.write(output || "local M06 load test failed\n");
  process.exitCode = 1;
} else {
  const match = output.match(/M06-04 p95_ms=([0-9.]+)/);
  if (!match) {
    process.stderr.write(output || "M06-04 benchmark did not report p95\n");
    process.exitCode = 1;
  } else {
    console.log(`PASS local M06-04 load: 10,000 synthetic persons, p95=${match[1]}ms, page bounded at 100, canonical search index present`);
  }
}
