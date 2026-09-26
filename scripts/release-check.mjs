import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const approvals = JSON.parse(readFileSync(resolve(root, "state/APPROVALS.json"), "utf8"));
const pending = approvals.approvals.filter((item) => item.status !== "APPROVED").map((item) => item.id);
console.error(JSON.stringify({ status: "BLOCKED", reason: "human approvals are pending", pendingApprovals: pending, productionDeploy: "NOT_RUN" }, null, 2));
process.exitCode = 2;
