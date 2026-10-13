// Explicit ESM keeps the independent validator's ESM dependencies compatible.
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, isAbsolute } from "node:path";
import { assertVendorGedcom, type VendorCase } from "../packages/domain/tests/gedcom-interop-assertions";

const directory = resolve(process.argv[2] ?? "");
const base = resolve("reports/local/gedcom-interop");
const subpath = relative(base, directory);
if (!subpath || subpath.startsWith("..") || isAbsolute(subpath)) throw new Error("Evidence directory must be an isolated run within the local GEDCOM QA folder");
const files: Array<[string, VendorCase]> = [["gramps-5.1.5.ged", "gramps"], ["geneweb-7.1.0-beta2.ged", "geneweb-native"], ["geneweb-project-roundtrip.ged", "geneweb-project"]];
const results = files.map(([filename, kind]) => assertVendorGedcom(readFileSync(resolve(directory, filename), "utf8"), kind));
writeFileSync(resolve(directory, "semantic-report.json"), JSON.stringify({ status: "PASS", scope: "measured synthetic GEDCOM 5.5.1 profile; vendor losses explicitly reported", results }, null, 2) + "\n");
console.log("PASS local application generation and measured GEDCOM subset semantics; GeneWeb name/citation losses explicitly reported. Not lossless vendor round-trip certification.");
