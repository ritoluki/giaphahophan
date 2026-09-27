import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sql = readFileSync(resolve(root, "supabase/tests/m12_revision_publish.sql"), "utf8");
const result = spawnSync(
  "docker.exe",
  ["exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
  { cwd: root, input: sql, encoding: "utf8", windowsHide: true },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "local M12-02 revision/publish test failed\n");
  process.exitCode = 1;
} else {
  console.log("PASS local M12-02: published pointer, immutable snapshot and preview token boundary");
}
