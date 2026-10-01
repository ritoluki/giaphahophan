import { describe, expect, it } from "vitest";
import { dryRunGedcomImport } from "./m16-gedcom";

const fixture = (version: "5.5.1" | "7.0", date = "ABT 1901") => `0 HEAD\n1 SOUR SyntheticFixture\n1 GEDC\n2 VERS ${version}\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME An /Nguyen/\n1 SEX U\n1 BIRT\n2 DATE ${date}\n2 PLAC Hue\n2 ZZTEST raw extension\n1 FAMC @F1@\n1 _PHAN_PRIVACY restricted\n1 _PHAN_LUNAR_DATE 12/03/Canh Ty\n0 @I2@ INDI\n1 NAME Bình /Trần/\n0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I2@\n1 NOTE private synthetic note\n0 @N1@ NOTE Standalone private note\n0 TRLR\n`;

describe("M16 bounded GEDCOM 5.5.1/7 subset import", () => {
  it.each(["5.5.1", "7.0"] as const)("recognizes version %s and stages linked records without inferring spouse gender", (version) => {
    const result = dryRunGedcomImport(fixture(version));
    expect(result).toMatchObject({ version, parserVersion: "gedcom-subset/1", valid: 3, invalid: 0 });
    expect(result?.records[0]?.normalized).toMatchObject({ displayName: "An Nguyen", sex: "U", birthDate: { precision: "about", year: 1901 }, familyChildRefs: [{ xref: "F1" }] });
    expect(result?.records[2]?.normalized).toMatchObject({ partnerRefs: [{ sourceTag: "HUSB", xref: "I1" }], childRefs: ["I2"] });
    expect(result?.records[0]?.raw).toContain("1 _PHAN_LUNAR_DATE 12/03/Canh Ty");
    expect(result?.records[3]?.raw).toContain("0 @N1@ NOTE Standalone private note");
    expect(result?.rows[3]).toMatchObject({ status: "review", errors: ["record_type_preserved_for_review"] });
    expect(result?.warnings).toContain("unknown_tags_preserved_for_review");
    expect(result?.conformance.unsupported).toContain("NOTE");
    expect(result?.conformance.unknownTags).toContain("ZZTEST");
    expect(result?.conformance.supported).toContain("_PHAN_LUNAR_DATE");
    expect(result?.warnings).toContain("privacy_defaults_to_restricted; no GEDCOM note or media path is published");
  });

  it("preserves unknown structures and does not guess unsupported/non-Gregorian date text", () => {
    const result = dryRunGedcomImport(fixture("7.0", "@#DHEBREW@ 3 TSH 5784"));
    expect(result?.records[0]?.normalized.birthDate).toMatchObject({ calendar: "unknown", precision: "unknown", originalText: "@#DHEBREW@ 3 TSH 5784" });
    expect(result?.conformance.supported).toContain("_PHAN_LUNAR_DATE");
    expect(result?.records[0]?.raw.join("\n")).toContain("1 _PHAN_PRIVACY restricted");
    const julian = dryRunGedcomImport(fixture("7.0", "@#DJULIAN@ 29 FEB 1900"));
    expect(julian?.records[0]?.normalized.birthDate).toMatchObject({ calendar: "julian", precision: "exact", day: 29 });
    const invalidJulian = dryRunGedcomImport(fixture("7.0", "@#DJULIAN@ 30 FEB 1900"));
    expect(invalidJulian?.records[0]?.normalized.birthDate).toMatchObject({ calendar: "unknown", precision: "unknown" });
  });

  it("rejects malformed hierarchy, missing trailer/header, unsupported version, and over-limit input", () => {
    expect(dryRunGedcomImport("0 HEAD\n1 GEDC\n2 VERS 5.5\n0 TRLR")).toBeNull();
    expect(dryRunGedcomImport("0 HEAD\n2 SOUR invalid\n0 TRLR")).toBeNull();
    expect(dryRunGedcomImport("0 HEAD\n1 GEDC\n2 VERS 7.0\n")).toBeNull();
    expect(dryRunGedcomImport(`0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n${"x".repeat(32_769)}\n0 TRLR`)).toBeNull();
    expect(dryRunGedcomImport("0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n0 @I1@ FAM\n0 TRLR")).toBeNull();
  });

  it("puts unresolved relationship pointers into review instead of dropping the edge", () => {
    const result = dryRunGedcomImport("0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME An /Nguyen/\n1 FAMC @MISSING@\n0 TRLR");
    expect(result?.rows[0]).toMatchObject({ status: "review", errors: ["unresolved_relationship_reference"] });
    expect(result?.records[0]?.normalized.familyChildRefs).toEqual([{ xref: "MISSING", pedigree: null, status: null }]);
  });
});
