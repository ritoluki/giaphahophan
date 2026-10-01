import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const appRoot = process.cwd();
const distDir = process.env.NEXT_DIST_DIR ?? ".next";
if (!/^\.next(?:-[a-z0-9-]+)?$/i.test(distDir)) throw new Error("NEXT_DIST_DIR must be a .next-prefixed directory name");
const buildRoot = path.join(appRoot, distDir);
const standaloneRoot = path.join(buildRoot, "standalone", "apps", "web");

await mkdir(standaloneRoot, { recursive: true });
await cp(path.join(appRoot, "public"), path.join(standaloneRoot, "public"), { recursive: true, force: true });
await cp(path.join(buildRoot, "static"), path.join(standaloneRoot, distDir, "static"), { recursive: true, force: true });
console.log("Standalone artifact prepared with public assets and static chunks.");
