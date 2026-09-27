import type { Graph, PersonSummary } from "@phan/contracts";

export type GraphMode = "ancestors" | "descendants" | "family" | "roots";
export type GraphParentLink = {
  id: string;
  parentId: string;
  childId: string;
  kind: "biological" | "adoptive" | "guardian" | "step";
  status: "confirmed" | "disputed";
};
export type GraphUnion = {
  id: string;
  partnerIds: ReadonlyArray<string>;
  childIds: ReadonlyArray<string>;
};

export type GraphInput = {
  rootPersonId: string;
  people: ReadonlyArray<PersonSummary>;
  parentLinks: ReadonlyArray<GraphParentLink>;
  unions?: ReadonlyArray<GraphUnion>;
  graphRevision?: number;
};

type WorkItem = { personId: string; depth: number; path: ReadonlyArray<string> };
type EdgeDraft = {
  id: string;
  sourcePersonId: string;
  targetPersonId: string;
  sourcePath: ReadonlyArray<string>;
  targetPath: ReadonlyArray<string>;
  kind: Graph["edges"][number]["kind"];
  status?: "confirmed" | "disputed" | undefined;
};

function occurrenceId(mode: GraphMode, path: ReadonlyArray<string>): string {
  return `occurrence:${mode}:${path.join("/")}`;
}

export type GraphOccurrenceGroup = {
  canonicalPersonId: string;
  person: PersonSummary;
  occurrenceIds: ReadonlyArray<string>;
  depths: ReadonlyArray<number>;
};

export function collapseGraphOccurrences(graph: Graph): Array<GraphOccurrenceGroup> {
  const groups = new Map<string, { person: PersonSummary; occurrenceIds: string[]; depths: number[] }>();
  for (const node of graph.nodes) {
    const existing = groups.get(node.person.id);
    if (existing) {
      existing.occurrenceIds.push(node.occurrenceId);
      existing.depths.push(node.depth);
      continue;
    }
    groups.set(node.person.id, {
      person: node.person,
      occurrenceIds: [node.occurrenceId],
      depths: [node.depth]
    });
  }
  return [...groups.entries()].map(([canonicalPersonId, group]) => ({
    canonicalPersonId,
    person: group.person,
    occurrenceIds: group.occurrenceIds,
    depths: group.depths
  }));
}
function unique(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}

export function buildGraphProjection(input: GraphInput, mode: GraphMode, depth: number, maxNodes: number): Graph {
  if (!Number.isInteger(depth) || depth < 1 || depth > 6) throw new RangeError("depth must be between 1 and 6");
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 300) throw new RangeError("maxNodes must be between 1 and 300");

  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const parentLinks = input.parentLinks.filter((link) => peopleById.has(link.parentId) && peopleById.has(link.childId));
  const unions = input.unions ?? [];
  const roots = input.people.filter((person) => !parentLinks.some((link) => link.childId === person.id));
  const seeds: WorkItem[] = mode === "roots"
    ? roots.map((person) => ({ personId: person.id, depth: 0, path: [person.id] }))
    : [{ personId: input.rootPersonId, depth: 0, path: [input.rootPersonId] }];

  const queue = [...seeds];
  const visited = new Set<string>();
  const drafts: Array<{ work: WorkItem; person: PersonSummary }> = [];
  const edges: EdgeDraft[] = [];
  let truncated = false;

  while (queue.length > 0) {
    const work = queue.shift();
    if (!work) break;
    const key = work.path.join("/");
    if (visited.has(key)) continue;
    visited.add(key);
    const person = peopleById.get(work.personId);
    if (!person) continue;
    if (drafts.length >= maxNodes) {
      truncated = true;
      break;
    }
    drafts.push({ work, person });
    if (work.depth >= depth || mode === "roots") continue;

    const neighbors: Array<{ personId: string; kind: Graph["edges"][number]["kind"]; status?: "confirmed" | "disputed"; edgeId: string; sourcePersonId: string; targetPersonId: string }> = [];
    if (mode === "ancestors" || mode === "family") {
      for (const link of parentLinks.filter((candidate) => candidate.childId === work.personId)) {
        neighbors.push({ personId: link.parentId, kind: link.kind, status: link.status, edgeId: link.id, sourcePersonId: link.parentId, targetPersonId: link.childId });
      }
    }
    if (mode === "descendants" || mode === "family") {
      for (const link of parentLinks.filter((candidate) => candidate.parentId === work.personId)) {
        neighbors.push({ personId: link.childId, kind: link.kind, status: link.status, edgeId: link.id, sourcePersonId: link.parentId, targetPersonId: link.childId });
      }
    }
    if (mode === "family") {
      for (const union of unions) {
        if (!union.partnerIds.includes(work.personId)) continue;
        for (const partnerId of union.partnerIds.filter((id) => id !== work.personId)) {
          neighbors.push({ personId: partnerId, kind: "union", edgeId: union.id, sourcePersonId: work.personId, targetPersonId: partnerId });
        }
        for (const childId of union.childIds) {
          neighbors.push({ personId: childId, kind: "union", edgeId: union.id, sourcePersonId: work.personId, targetPersonId: childId });
        }
      }
    }

    for (const neighbor of neighbors) {
      if (work.path.includes(neighbor.personId)) continue;
      const nextPath = [...work.path, neighbor.personId];
      const sourcePath = neighbor.sourcePersonId === work.personId ? work.path : nextPath;
      const targetPath = neighbor.targetPersonId === work.personId ? work.path : nextPath;
      queue.push({ personId: neighbor.personId, depth: work.depth + 1, path: nextPath });
      edges.push({ id: neighbor.edgeId, sourcePersonId: neighbor.sourcePersonId, targetPersonId: neighbor.targetPersonId, sourcePath, targetPath, kind: neighbor.kind, status: neighbor.status });
    }
  }

  const nodeKey = (path: ReadonlyArray<string>) => path.join("/");
  const selectedKeys = new Set(drafts.map(({ work }) => nodeKey(work.path)));
  const edgeByKey = new Map<string, EdgeDraft>();
  for (const edge of edges) {
    if (!selectedKeys.has(nodeKey(edge.sourcePath)) || !selectedKeys.has(nodeKey(edge.targetPath))) continue;
    const edgeKey = `${edge.id}:${nodeKey(edge.sourcePath)}:${nodeKey(edge.targetPath)}`;
    if (!edgeByKey.has(edgeKey)) edgeByKey.set(edgeKey, edge);
  }
  const graphEdges = [...edgeByKey.values()]
    .map((edge) => ({
      id: edge.id,
      sourceOccurrenceId: occurrenceId(mode, edge.sourcePath),
      targetOccurrenceId: occurrenceId(mode, edge.targetPath),
      kind: edge.kind,
      ...(edge.status ? { status: edge.status } : {})
    }));

  const nodes = drafts.map(({ work, person }) => ({
    occurrenceId: occurrenceId(mode, work.path),
    person,
    depth: work.depth
  }));
  const expandablePersonIds = unique(drafts.filter(({ work }) => work.depth < depth).map(({ person }) => person.id));
  const reason = truncated ? "node_limit" : drafts.some(({ work }) => work.depth === depth) ? "depth_limit" : null;

  return {
    nodes,
    edges: graphEdges,
    roots: nodes.filter((node) => node.depth === 0).map((node) => node.occurrenceId),
    graphRevision: input.graphRevision ?? 1,
    truncated,
    reason,
    expandablePersonIds
  };
}
