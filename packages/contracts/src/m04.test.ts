import { describe, expect, it } from "vitest";
import { graphProjectionSchema } from "./index";

describe("M04 graph contracts", () => {
  it("requires root-relative generation on each occurrence", () => {
    const projection = graphProjectionSchema.parse({
      nodes: [{ occurrenceId: "occurrence:ancestors:root", person: { id: "00000000-0000-4000-8000-000000000001", version: 1, code: "ROOT", displayName: "Root", lifeStatus: "deceased", isDemo: true }, depth: 0, generation: 0 }],
      edges: [], roots: ["occurrence:ancestors:root"], graphRevision: 1, truncated: false, reason: null, nextExpansion: null, expandablePersonIds: []
    });
    expect(projection.nodes[0]?.generation).toBe(0);
  });

  it("accepts bounded next expansion guidance", () => {
    const projection = graphProjectionSchema.parse({
      nodes: [],
      edges: [],
      roots: [],
      graphRevision: 1,
      truncated: true,
      reason: "node_limit",
      nextExpansion: { direction: "descendants", depth: 4, maxNodes: 240, anchorOccurrenceId: null },
      expandablePersonIds: []
    });
    expect(projection.nextExpansion?.maxNodes).toBe(240);
  });
});