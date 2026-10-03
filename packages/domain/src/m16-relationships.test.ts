import { describe, expect, it } from "vitest";
import { planImportRelationships } from "./m16-relationships";

const snapshotHash = "a".repeat(64);
const person = (xref: string, spouses: string[] = [], families: string[] = []) => ({ xref, normalized: { recordType: "INDI", displayName: "Same fictional name", sex: "U", familySpouseRefs: spouses, familyChildRefs: families.map((id) => ({ xref: id })) } });
const family = (xref: string, partners: string[], children: string[]) => ({ xref, normalized: { recordType: "FAM", partnerRefs: partners.map((id, index) => ({ xref: id, sourceTag: index ? "WIFE" : "HUSB" })), childRefs: children } });
const source = { version: 2, snapshotHash, excludedExternalIds: [], records: [person("P1", ["F1"]), person("P2", ["F1"]), person("C1", [], ["F1"]), family("F1", ["P1", "P2"], ["C1"])] };
const mapping = { baseVersion: 2, snapshotHash, familyExternalId: "F1", partnerExternalIds: ["P1", "P2"], childExternalIds: ["C1"], parentLinks: [], reason: "Synthetic source reviewed" };

describe("M16 explicit relationship preflight", () => {
  it("groups union children without inventing parents or sex from source tags/names", () => {
    expect(planImportRelationships(source, [mapping])).toMatchObject({ status: "valid", parentLinkCount: 0 });
    expect(planImportRelationships(source, [{ ...mapping, partnerExternalIds: ["P1"] }])).toMatchObject({ status: "invalid", issues: ["REFERENCE_NOT_IN_SOURCE"] });
    expect(planImportRelationships({ ...source, records: [...source.records, { xref: "S1", normalized: { recordType: "SOUR", rawNote: "private" } }] }, [mapping])).toMatchObject({ status: "valid", parentLinkCount: 0 });
  });
  it("requires explicit kind/status, snapshot and nonblank source reason", () => {
    expect(planImportRelationships(source, [{ ...mapping, baseVersion: 3 }])).toMatchObject({ status: "invalid", issues: ["STALE_SNAPSHOT"] });
    expect(planImportRelationships(source, [{ ...mapping, reason: " " }])).toMatchObject({ status: "invalid", issues: ["INVALID_MAPPING"] });
    expect(planImportRelationships(source, [{ ...mapping, parentLinks: [{ parentExternalId: "P1", childExternalId: "C1" }] }])).toMatchObject({ status: "invalid", issues: ["INVALID_MAPPING"] });
  });
  it("never creates missing/excluded people and rejects IDs not evidenced by source", () => {
    expect(planImportRelationships({ ...source, excludedExternalIds: ["P1"] }, [mapping])).toMatchObject({ status: "invalid", issues: ["REFERENCE_NOT_IN_SOURCE", "UNAVAILABLE_PERSON"] });
    expect(planImportRelationships(source, [{ ...mapping, partnerExternalIds: ["missing"] }])).toMatchObject({ status: "invalid", issues: ["REFERENCE_NOT_IN_SOURCE", "UNAVAILABLE_PERSON"] });
    expect(planImportRelationships({ ...source, records: [...source.records, person("P1")] }, [mapping])).toMatchObject({ status: "invalid", issues: ["DUPLICATE_EXTERNAL_ID", "REFERENCE_NOT_IN_SOURCE"] });
  });
  it("rejects a missing reverse pointer so FAM and INDI relationship references cannot diverge", () => {
    const oneSided = { ...source, records: [person("P1"), person("P2", ["F1"]), person("C1", [], ["F1"]), family("F1", ["P1", "P2"], ["C1"])] };
    expect(planImportRelationships(oneSided, [mapping])).toMatchObject({ status: "invalid", issues: ["REFERENCE_NOT_IN_SOURCE"] });
  });
  it("checks cycles across every family decision, but not disputed/guardian ancestry", () => {
    const cycleSource = { ...source, records: [person("A", ["FA"], ["FB"]), person("B", ["FB"], ["FA"]), family("FA", ["A"], ["B"]), family("FB", ["B"], ["A"])] };
    const decisions = [
      { ...mapping, familyExternalId: "FA", partnerExternalIds: ["A"], childExternalIds: ["B"], parentLinks: [{ parentExternalId: "A", childExternalId: "B", kind: "biological", status: "confirmed" }] },
      { ...mapping, familyExternalId: "FB", partnerExternalIds: ["B"], childExternalIds: ["A"], parentLinks: [{ parentExternalId: "B", childExternalId: "A", kind: "adoptive", status: "confirmed" }] },
    ];
    expect(planImportRelationships(cycleSource, decisions)).toMatchObject({ status: "invalid", issues: ["ANCESTRY_CYCLE"] });
    expect(planImportRelationships(cycleSource, [decisions[0], { ...decisions[1], parentLinks: [{ parentExternalId: "B", childExternalId: "A", kind: "guardian", status: "confirmed" }] }])).toMatchObject({ status: "valid" });
    expect(planImportRelationships(cycleSource, [decisions[0], { ...decisions[1], parentLinks: [{ parentExternalId: "B", childExternalId: "A", kind: "adoptive", status: "disputed" }] }])).toMatchObject({ status: "valid" });
  });
  it("denies duplicate edges and more than two confirmed biological parents", () => {
    const threeSource = { ...source, records: [person("P1", ["F1"]), person("P2", ["F1"]), person("P3", ["F1"]), person("C1", [], ["F1"]), family("F1", ["P1", "P2", "P3"], ["C1"])] };
    const parentLinks = ["P1", "P2", "P3"].map((id) => ({ parentExternalId: id, childExternalId: "C1", kind: "biological", status: "confirmed" }));
    expect(planImportRelationships(threeSource, [{ ...mapping, partnerExternalIds: ["P1", "P2", "P3"], parentLinks }])).toMatchObject({ status: "invalid", issues: ["BIOLOGICAL_PARENT_LIMIT"] });
    expect(planImportRelationships(source, [{ ...mapping, parentLinks: [parentLinks[0], parentLinks[0]] }])).toMatchObject({ status: "invalid", issues: ["DUPLICATE_PARENT_LINK"] });
  });
  it("rejects self-parent and duplicate family decisions rather than repairing source", () => {
    const sameSource = { ...source, records: [person("P1", ["F1"], ["F1"]), family("F1", ["P1"], ["P1"])] };
    const same = { ...mapping, partnerExternalIds: ["P1"], childExternalIds: ["P1"], parentLinks: [{ parentExternalId: "P1", childExternalId: "P1", kind: "biological", status: "confirmed" }] };
    const result = planImportRelationships(sameSource, [same]);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.issues).toContain("SELF_PARENT");
    expect(planImportRelationships(source, [mapping, mapping])).toMatchObject({ status: "invalid", issues: ["DUPLICATE_FAMILY_DECISION"] });
  });
  it("bounds total participant/edge work before building graph", () => {
    const oversized = Array.from({ length: 10 }, () => ({ ...mapping, parentLinks: Array.from({ length: 2000 }, () => ({ parentExternalId: "P1", childExternalId: "C1", kind: "biological", status: "confirmed" })) }));
    expect(planImportRelationships(source, oversized)).toEqual({ status: "invalid", issues: ["RELATIONSHIP_LIMIT"] });
  });
});
