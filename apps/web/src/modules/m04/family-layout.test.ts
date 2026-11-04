import { describe, expect, it } from "vitest";
import { layoutFamilyNodes } from "./family-layout";
import { familyLayoutRequestSchema } from "./family-layout-types";

describe("ELK family layout", () => {
  it("keeps a couple in the same lane, parents above children, and every name apart", async () => {
    const result = await layoutFamilyNodes({
      nodes: [
        { id: "parent", width: 248, height: 112, lane: -1 },
        { id: "focus", width: 248, height: 112, lane: 0 },
        { id: "partner", width: 248, height: 112, lane: 0 },
        { id: "other-partner", width: 248, height: 144, lane: 0 },
        { id: "child", width: 248, height: 112, lane: 1 }
      ],
      edges: [
        { id: "p", source: "parent", target: "focus" },
        { id: "c", source: "focus", target: "child" }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("ELK layout did not complete");
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    expect(byId.get("focus")!.y).toBe(byId.get("partner")!.y);
    // Different-height nodes are centered within their shared lane.
    expect(Math.abs(byId.get("focus")!.y - byId.get("other-partner")!.y)).toBeLessThan(40);
    expect(byId.get("parent")!.y + 112).toBeLessThan(byId.get("focus")!.y);
    expect(byId.get("focus")!.y + 112).toBeLessThan(byId.get("child")!.y);
    for (const [index, node] of result.nodes.entries()) {
      for (const other of result.nodes.slice(index + 1)) {
        const horizontalGap = Math.abs(node.x - other.x);
        const verticalGap = Math.abs(node.y - other.y);
        expect(horizontalGap >= 248 || verticalGap >= 112).toBe(true);
      }
    }
  });

  it("rejects oversized work and malformed dimensions before starting the worker", () => {
    expect(familyLayoutRequestSchema.safeParse({ nodes: [{ id: "x", width: 0, height: 112, lane: 0 }], edges: [] }).success).toBe(false);
    expect(familyLayoutRequestSchema.safeParse({ nodes: Array.from({ length: 301 }, (_, index) => ({ id: String(index), width: 248, height: 112, lane: 0 })), edges: [] }).success).toBe(false);
  });
});
