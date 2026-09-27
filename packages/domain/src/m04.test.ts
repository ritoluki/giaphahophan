import { describe, expect, it } from "vitest";
import { buildGraphProjection, type GraphInput } from "./m04";

const people = [
  { id: "00000000-0000-4000-8000-000000000001", version: 1, code: "ROOT", displayName: "Root", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true },
  { id: "00000000-0000-4000-8000-000000000002", version: 1, code: "CHILD", displayName: "Child", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true },
  { id: "00000000-0000-4000-8000-000000000003", version: 1, code: "ADOPT", displayName: "Adoptive", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true },
  { id: "00000000-0000-4000-8000-000000000004", version: 1, code: "PARTNER", displayName: "Partner", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true }
];
const input: GraphInput = {
  rootPersonId: people[1]!.id,
  people,
  parentLinks: [
    { id: "link-biological", parentId: people[0]!.id, childId: people[1]!.id, kind: "biological", status: "confirmed" },
    { id: "link-adoptive", parentId: people[2]!.id, childId: people[1]!.id, kind: "adoptive", status: "disputed" }
  ],
  unions: [{ id: "union-1", partnerIds: [people[1]!.id, people[3]!.id], childIds: [] }]
};

describe("M04 graph projection", () => {
  it("supports modes and keeps canonical person IDs across occurrences", () => {
    const graph = buildGraphProjection(input, "ancestors", 3, 120);
    expect(graph.nodes.map((node) => node.person.code)).toEqual(["CHILD", "ROOT", "ADOPT"]);
    expect(graph.edges.find((edge) => edge.kind === "adoptive")?.status).toBe("disputed");
    expect(buildGraphProjection(input, "family", 1, 120).edges.some((edge) => edge.kind === "union")).toBe(true);
  });

  it("honors node caps and keeps disconnected roots separate", () => {
    const limited = buildGraphProjection({ ...input, rootPersonId: people[0]!.id }, "descendants", 3, 1);
    expect(limited.truncated).toBe(true);
    const roots = buildGraphProjection(input, "roots", 3, 120);
    expect(roots.nodes.map((node) => node.person.code)).toEqual(["ROOT", "ADOPT", "PARTNER"]);
  });
});
