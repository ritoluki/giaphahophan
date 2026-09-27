import { describe, expect, it } from "vitest";
import { findKinshipPaths, type KinshipInput } from "./m05";

const people = [
  { id: "00000000-0000-4000-8000-000000000001", version: 1, code: "A", displayName: "A", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true },
  { id: "00000000-0000-4000-8000-000000000002", version: 1, code: "B", displayName: "B", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true },
  { id: "00000000-0000-4000-8000-000000000003", version: 1, code: "C", displayName: "C", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true },
  { id: "00000000-0000-4000-8000-000000000004", version: 1, code: "HIDDEN", displayName: "Hidden", lifeStatus: "living" as const, primaryBranchId: null, isDemo: true }
];
const base: KinshipInput = {
  fromPersonId: people[0]!.id,
  toPersonId: people[2]!.id,
  people,
  edges: [
    { sourcePersonId: people[0]!.id, targetPersonId: people[1]!.id, kind: "biological", status: "confirmed" },
    { sourcePersonId: people[1]!.id, targetPersonId: people[2]!.id, kind: "adoptive", status: "confirmed" },
    { sourcePersonId: people[0]!.id, targetPersonId: people[3]!.id, kind: "biological", status: "confirmed" }
  ]
};

describe("M05 authorized kinship path", () => {
  it("returns a shortest path with explicit relation direction", () => {
    const result = findKinshipPaths(base);
    expect(result.status).toBe("found");
    expect(result.paths[0]?.map((node) => node.via)).toEqual(["start", "child", "adoptive_child"]);
    expect(result.visitedCount).toBeGreaterThan(0);
  });

  it("does not traverse adoptive edges when excluded", () => {
    const result = findKinshipPaths({ ...base, includeAdoptive: false });
    expect(result.status).toBe("not_found_within_visible_graph");
    expect(result.paths).toEqual([]);
  });

  it("never uses an edge whose endpoint is outside the visible person set", () => {
    const result = findKinshipPaths({ ...base, people: people.slice(0, 3), toPersonId: people[0]!.id, edges: [{ sourcePersonId: people[0]!.id, targetPersonId: people[3]!.id, kind: "biological", status: "confirmed" }] });
    expect(result.status).toBe("found");
    expect(result.paths[0]?.map((node) => node.person.id)).toEqual([people[0]!.id]);
  });

  it("reports a bounded search instead of claiming no relationship", () => {
    const result = findKinshipPaths({ ...base, maxSteps: 1 });
    expect(result.status).toBe("limit_reached");
    expect(result.truncated).toBe(true);
  });
});