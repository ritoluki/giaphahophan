import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { serializeExportGedcom551, serializeExportGedcom7 } from "../packages/domain/src/m16-export";
import type { ExportProjection } from "../packages/contracts/src/m16-export";

const id = (n: number) => `d1600000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projection: ExportProjection = {
  schemaVersion: "phan-export/1", treeId: id(10), policyVersion: 1,
  generatedAt: "2026-01-01T00:00:00Z", isDemo: true, scope: { kind: "tree" },
  people: [
    { id: id(1), displayName: "An DEMO_PHAN", version: 1, code: "DEMO-1", names: [], recordedSex: "M", lifeStatus: null,
      facts: [{ id: id(11), kind: "birth", valueDate: { calendar: "gregorian", precision: "year", year: 1940, originalText: "1940" }, valueText: null, confidence: "supported" }] },
    { id: id(2), displayName: "Bình DEMO_TRAN", version: 1, code: "DEMO-2", names: [], recordedSex: "F", lifeStatus: null,
      facts: [{ id: id(12), kind: "birth", valueDate: { calendar: "gregorian", precision: "year", year: 1942, originalText: "1942" }, valueText: null, confidence: "supported" }] },
    { id: id(3), displayName: "Cường DEMO_PHAN", version: 1, code: "DEMO-3", names: [], recordedSex: null, lifeStatus: null,
      facts: [{ id: id(13), kind: "birth", valueDate: { calendar: "gregorian", precision: "exact", year: 1970, month: 3, day: 12, originalText: "12 MAR 1970" }, valueText: null, confidence: "supported" }] },
  ],
  parentLinks: [1, 2].map(n => ({ id: id(20 + n), parentId: id(n), childId: id(3), kind: "biological", status: "confirmed" })),
  unions: [{ id: id(30), kind: "marriage", status: "active", partnerIds: [id(1), id(2)], childIds: [id(3)] }],
  sources: [{ id: id(40), title: "Tư liệu hư cấu — DEMO" }],
  citations: [{ id: id(41), sourceId: id(40), targetKind: "fact", targetId: id(13), locator: "Trang 12" }],
};
const directory = resolve("reports/local/gedcom-interop/input");
mkdirSync(directory, { recursive: true });
for (const [version, serialize] of [["551", serializeExportGedcom551], ["7", serializeExportGedcom7]] as const) {
  const artifact = serialize(projection);
  writeFileSync(resolve(directory, `project-${version}.ged`), artifact.content, "utf8");
  writeFileSync(resolve(directory, `project-${version}.json`), artifact.sidecarContent ?? "", "utf8");
}
console.log("Generated fictional demo-only project GEDCOM 5.5.1/7 inputs and JSON sidecars under reports/local/gedcom-interop/input");
