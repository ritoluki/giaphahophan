import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const image = "phan-gia-pha-gedcom-interop:20261013";
let stage = "environment";
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 300_000 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
try {
  const imageId = run("docker", ["image", "inspect", "--format", "{{.Id}}", image]).trim();
  stage = "fixtures";
  run(process.execPath, ["--import", "./apps/worker/node_modules/tsx/dist/loader.mjs", "scripts/generate-m16-interop-input.ts"]);
  const artifacts = join(root, "reports/local/gedcom-interop");
  mkdirSync(artifacts, { recursive: true });
  const output = mkdtempSync(join(artifacts, "run-"));
  console.log(`Local synthetic GEDCOM evidence: ${output}`);
  run("docker", ["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--pids-limit", "128", "--memory", "1g", "--cpus", "2",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=128m",
    "--mount", `type=bind,source=${join(artifacts, "input")},target=/input,readonly`,
    "--mount", `type=bind,source=${join(root, "tools/gedcom-interop")},target=/tools,readonly`,
    "--mount", `type=bind,source=${output},target=/work`, image, "sh", "/tools/run.sh"]);
  writeFileSync(join(output, "runtime.json"), JSON.stringify({ image, imageId, network: "none", dataMode: "synthetic-demo" }, null, 2) + "\n");
  console.log(run(process.execPath, ["--import", "./apps/worker/node_modules/tsx/dist/loader.mjs", "scripts/verify-m16-interop-artifacts.mts", output]).trim());
} catch (error) {
  console.error(`${stage === "environment" ? "BLOCKED" : "FAIL"} local GEDCOM application run: ${error instanceof Error ? error.message : "unknown failure"}`);
  process.exitCode = stage === "environment" ? 2 : 1;
}
