import { describe, expect, it } from "vitest";
import { graphProjectionSchema } from "./index";

describe("M04 graph contracts", () => {
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