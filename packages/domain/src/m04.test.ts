import { describe, expect, it } from "vitest";
import { buildGraphProjection, collapseGraphOccurrences, type GraphInput } from "./m04";

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
    expect(limited.nextExpansion).toEqual({ direction: "descendants", depth: 4, maxNodes: 2, anchorOccurrenceId: null });
    const depthLimited = buildGraphProjection({ ...input, rootPersonId: people[0]!.id }, "descendants", 1, 120);
    expect(depthLimited.truncated).toBe(true);
    expect(depthLimited.reason).toBe("depth_limit");
    expect(depthLimited.nextExpansion?.depth).toBe(2);
    const roots = buildGraphProjection(input, "roots", 3, 120);
    expect(roots.nodes.map((node) => node.person.code)).toEqual(["ROOT", "ADOPT", "PARTNER"]);
  });
  it("collapses repeated canonical people without losing occurrence identity", () => {
    const collapsePeople = [
      ...people,
      { id: "00000000-0000-4000-8000-000000000005", version: 1, code: "SHARED", displayName: "Shared Person", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true }
    ];
    const collapsedGraph = buildGraphProjection({
      rootPersonId: people[0]!.id,
      people: collapsePeople,
      parentLinks: [
        { id: "root-left", parentId: people[0]!.id, childId: people[1]!.id, kind: "biological", status: "confirmed" },
        { id: "root-right", parentId: people[0]!.id, childId: people[2]!.id, kind: "biological", status: "confirmed" },
        { id: "shared-left", parentId: people[1]!.id, childId: collapsePeople[4]!.id, kind: "biological", status: "confirmed" },
        { id: "shared-right", parentId: people[2]!.id, childId: collapsePeople[4]!.id, kind: "biological", status: "confirmed" }
      ]
    }, "descendants", 3, 120);
    const sharedOccurrences = collapsedGraph.nodes.filter((node) => node.person.id === collapsePeople[4]!.id);
    expect(sharedOccurrences).toHaveLength(2);
    expect(new Set(sharedOccurrences.map((node) => node.occurrenceId)).size).toBe(2);
    expect(collapseGraphOccurrences(collapsedGraph).find((group) => group.canonicalPersonId === collapsePeople[4]!.id)?.occurrenceIds).toHaveLength(2);
  });
  it("keeps relative generation root-dependent across pedigree collapse", () => {
    const shared = { id: "00000000-0000-4000-8000-000000000005", version: 1, code: "SHARED", displayName: "Shared Person", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true };
    const bridge = { id: "00000000-0000-4000-8000-000000000006", version: 1, code: "BRIDGE", displayName: "Bridge Person", lifeStatus: "deceased" as const, primaryBranchId: null, isDemo: true };
    const generationGraph = buildGraphProjection({
      rootPersonId: people[0]!.id,
      people: [...people, shared, bridge],
      parentLinks: [
        { id: "left", parentId: people[0]!.id, childId: people[1]!.id, kind: "biological", status: "confirmed" },
        { id: "right", parentId: people[0]!.id, childId: people[2]!.id, kind: "biological", status: "confirmed" },
        { id: "short", parentId: people[1]!.id, childId: shared.id, kind: "biological", status: "confirmed" },
        { id: "long", parentId: people[2]!.id, childId: bridge.id, kind: "biological", status: "confirmed" },
        { id: "shared", parentId: bridge.id, childId: shared.id, kind: "biological", status: "confirmed" }
      ]
    }, "descendants", 4, 120);
    const sharedNodes = generationGraph.nodes.filter((node) => node.person.id === shared.id);
    expect(sharedNodes.map((node) => node.generation).sort()).toEqual([2, 3]);
    expect(collapseGraphOccurrences(generationGraph).find((group) => group.canonicalPersonId === shared.id)?.generationRange).toEqual({ values: [2, 3], min: 2, max: 3 });
    expect(generationGraph.nodes.find((node) => node.person.id === people[0]!.id)?.generation).toBe(0);
  });
});
