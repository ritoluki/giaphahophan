import assert from "node:assert/strict";
import { GedcomDocument } from "@domorium/validator";
import { dryRunGedcomImport } from "../src/m16-gedcom";

export type VendorCase = "gramps" | "geneweb-native" | "geneweb-project";
export function assertVendorGedcom(text: string, kind: VendorCase) {
  const structuralDiagnostics = new GedcomDocument().createDocument(text).getErrors();
  assert.deepEqual(structuralDiagnostics.map(diagnostic => diagnostic.code), kind === "gramps" ? [] : ["VAL002"]);
  const result = dryRunGedcomImport(text);
  assert.ok(result, `${kind}: parser must accept the vendor export`);
  assert.equal(result.version, "5.5.1");
  assert.equal(result.invalid, 0);
  const people = result.records.filter(record => record.tag === "INDI");
  const families = result.records.filter(record => record.tag === "FAM");
  assert.equal(people.length, 3);
  assert.equal(families.length, 1);
  assert.ok(people.every(person => person.normalized.privacy === "restricted"));
  assert.ok(result.rows.every(row => row.status === "review"));
  assert.ok(result.warnings.includes("relationship_mapping_requires_review"));
  assert.ok(!result.rows.some(row => row.errors.includes("unresolved_relationship_reference")));
  const ids = new Set(people.map(person => person.xref));
  const family = families[0]!;
  const partners = family.normalized.partnerRefs as Array<{ xref: string }>;
  const children = family.normalized.childRefs as string[];
  assert.equal(partners.length, 2);
  assert.equal(children.length, 1);
  assert.ok([...partners.map(partner => partner.xref), ...children].every(xref => ids.has(xref)));
  const child = people.find(person => person.xref === children[0]);
  assert.ok(child);
  for (const year of [1940, 1942]) {
    assert.ok(people.some(person => {
      const birth = person.normalized.birthDate as Record<string, unknown> | null;
      return birth?.year === year && birth.precision === "year" && !Object.hasOwn(birth, "month");
    }));
  }
  const birth = child.normalized.birthDate as Record<string, unknown>;
  assert.equal(birth.year, 1970);
  if (kind === "geneweb-native") {
    assert.equal(birth.precision, "year");
    assert.deepEqual(people.map(person => person.normalized.displayName), ["An DEMO PHAN", "Bình DEMO TRAN", "Cường DEMO PHAN"]);
    assert.deepEqual(family.normalized.marriageDate, { calendar: "gregorian", precision: "year", year: 1965, originalText: "1965" });
  } else {
    assert.equal(birth.precision, "exact");
    assert.equal(birth.month, 3);
    assert.equal(birth.day, 12);
    assert.equal(child.normalized.sex, null);
  }
  const losses: string[] = [];
  if (kind === "gramps") {
    assert.deepEqual(people.map(person => person.normalized.displayName), ["An DEMO_PHAN", "Bình DEMO_TRAN", "Cường DEMO_PHAN"]);
    assert.ok(child.raw.includes("3 PAGE Trang 12"));
    assert.ok(result.records.some(record => record.tag === "SOUR" && record.raw.includes("1 TITL Tư liệu hư cấu — DEMO")));
    assert.ok(result.conformance.unsupported.includes("SOUR"));
  }
  if (kind === "geneweb-project") {
    // Measured vendor losses are part of the compatibility profile. These are
    // never treated as evidence of a lossless genealogy round trip.
    assert.deepEqual(people.map(person => person.normalized.displayName), ["An DEMO_PHAN ?", "Bình DEMO_TRAN ?", "Cường DEMO_PHAN x"]);
    assert.ok(child.raw.includes("1 NOTE <b>Tư liệu hư cấu — DEMO</b>"));
    assert.ok(!child.raw.some(line => line.includes("PAGE Trang 12")));
    assert.ok(!result.records.some(record => record.tag === "SOUR"));
    assert.ok(result.conformance.unsupported.includes("NOTE"));
    losses.push("unknown_surname_placeholders_added", "source_flattened_to_private_note", "citation_locator_not_retained");
  }
  return { kind, dialect: result.version, people: people.length, families: families.length, losses, structuralDiagnostics };
}
