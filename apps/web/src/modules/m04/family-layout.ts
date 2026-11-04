import ELK from "elkjs/lib/elk.bundled.js";
import type { FamilyLayoutRequest, FamilyLayoutResult } from "./family-layout-types";

export async function layoutFamilyNodes(request: FamilyLayoutRequest): Promise<FamilyLayoutResult> {
  const elk = new ELK();
  try {
    const graph = await elk.layout({
      id: "family",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.partitioning.activate": "true",
        "elk.spacing.nodeNode": "64",
        "elk.layered.spacing.nodeNodeBetweenLayers": "112",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.separateConnectedComponents": "false"
      },
      children: request.nodes.map(({ lane, ...node }) => ({ ...node, layoutOptions: { "elk.partitioning.partition": String(lane + 6) } })),
      edges: request.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] }))
    });
    return { ok: true, nodes: (graph.children ?? []).map((node) => ({ id: node.id, x: node.x ?? 0, y: node.y ?? 0 })) };
  } catch {
    return { ok: false };
  }
}
