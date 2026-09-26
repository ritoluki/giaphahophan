import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const container = 'supabase_db_phan-gia-pha-local';
const testFile = resolve(root, 'supabase/tests/jobs.sql');
const result = spawnSync(
  'docker.exe',
  ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
  { cwd: root, input: readFileSync(testFile, 'utf8'), encoding: 'utf8', windowsHide: true }
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'local jobs test failed\n');
  process.exitCode = 1;
} else {
  console.log('PASS local JOBS-01: least-privilege claim, retry and idempotent publish');
}
