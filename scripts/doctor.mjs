import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const results = [];

function command(label, executable, args = [], envOverrides = {}) {
  try {
    const output = execFileSync(executable, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", env: { ...process.env, ...envOverrides } }).trim();
    results.push({ label, status: "PASS", detail: output.split("\n")[0] });
    return true;
  } catch (error) {
    const detail = error?.stderr?.toString().trim().split("\n")[0] ?? "command unavailable";
    results.push({ label, status: "BLOCKED", detail: detail || "command failed" });
    return false;
  }
}

function file(label, path) {
  const found = existsSync(resolve(root, path));
  results.push({ label, status: found ? "PASS" : "FAIL", detail: path });
  return found;
}

const nodeVersion = process.versions.node;
const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10);
results.push({ label: "Node.js 24 LTS baseline", status: nodeMajor >= 24 ? "PASS" : "BLOCKED", detail: `found ${nodeVersion}` });
command("pnpm", process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"]);
command("Docker client", process.platform === "win32" ? "docker.exe" : "docker", ["--version"]);
command("Docker daemon", process.platform === "win32" ? "docker.exe" : "docker", ["version", "--format", "{{.Server.Version}}"], { DOCKER_CONFIG: resolve(root, ".docker-config") });
file("workspace package", "package.json");
file("workspace lockfile", "pnpm-lock.yaml");
file("environment template", ".env.example");
file("approved design reference", "design/approved-assets/design-system-reference.png");

for (const item of results) console.log(`${item.status.padEnd(8)} ${item.label}: ${item.detail}`);
const blocked = results.filter((item) => item.status === "BLOCKED").length;
const failed = results.filter((item) => item.status === "FAIL").length;
if (blocked || failed) process.exitCode = 2;
