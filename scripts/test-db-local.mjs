import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const container = "supabase_db_phan-gia-pha-local";
const testFile = resolve(root, "supabase/tests/core_authorization.sql");

function runPsql(sql) {
  return spawnSync(
    "docker.exe",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { cwd: root, input: sql, encoding: "utf8", windowsHide: true }
  );
}

const migrationTest = runPsql(readFileSync(testFile, "utf8"));
if (migrationTest.status !== 0) {
  process.stderr.write(migrationTest.stderr || migrationTest.stdout || "local DB test failed\n");
  process.exitCode = 1;
} else {
  const rawTableAttempt = runPsql("set role authenticated; select count(*) from private.persons;\n");
  const denied = rawTableAttempt.status !== 0 && /permission denied for table persons/i.test(rawTableAttempt.stderr);
  if (!denied) {
    process.stderr.write("Expected authenticated raw private table access to be denied.\n");
    if (rawTableAttempt.stderr) process.stderr.write(rawTableAttempt.stderr);
    process.exitCode = 1;
  } else {
    console.log("PASS local CORE-01 authorization: projection, capability, review, audit/outbox and raw-table denial");
  }
}
