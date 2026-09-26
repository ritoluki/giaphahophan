import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const appRoot = process.cwd();
const standaloneRoot = path.join(appRoot, ".next", "standalone", "apps", "web");

await mkdir(standaloneRoot, { recursive: true });
await cp(path.join(appRoot, "public"), path.join(standaloneRoot, "public"), { recursive: true, force: true });
await cp(path.join(appRoot, ".next", "static"), path.join(standaloneRoot, ".next", "static"), { recursive: true, force: true });
console.log("Standalone artifact prepared with public assets and static chunks.");
