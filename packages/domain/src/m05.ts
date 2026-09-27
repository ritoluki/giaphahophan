import type { Kinship, PersonSummary } from "@phan/contracts";

export type KinshipEdge = {
  sourcePersonId: string;
  targetPersonId: string;
  kind: "biological" | "adoptive" | "guardian" | "step" | "union";
  status: "confirmed" | "disputed";
};

export type KinshipInput = {
  fromPersonId: string;
  toPersonId: string;
  people: ReadonlyArray<PersonSummary>;
  edges: ReadonlyArray<KinshipEdge>;
  includeAdoptive?: boolean;
  maxSteps?: number;
  maxVisited?: number;
  maxDurationMs?: number;
  now?: () => number;
};

type Neighbor = { personId: string; via: NonNullable<Kinship["paths"][number][number]>["via"] };
type QueueItem = { personId: string; pathIds: ReadonlyArray<string>; path: Kinship["paths"][number] };

function inferKinshipLabel(path: Kinship["paths"][number]): Pick<Kinship, "label" | "labelConfidence"> {
  const via = path[1]?.via;
  if (path.length === 1) return { label: "Cùng một hồ sơ", labelConfidence: "reviewed_rule" };
  if (path.length === 2 && via === "child") return { label: "con", labelConfidence: "reviewed_rule" };
  if (path.length === 2 && via === "parent") return { label: "cha/mẹ", labelConfidence: "reviewed_rule" };
  if (path.length === 2 && via === "adoptive_child") return { label: "con nuôi", labelConfidence: "reviewed_rule" };
  if (path.length === 2 && via === "adoptive_parent") return { label: "cha/mẹ nuôi", labelConfidence: "reviewed_rule" };
  if (path.length === 2 && via === "guardian_child") return { label: "người được giám hộ", labelConfidence: "descriptive_only" };
  if (path.length === 2 && via === "guardian_parent") return { label: "người giám hộ", labelConfidence: "descriptive_only" };
  if (path.length === 2 && via === "step_child") return { label: "con riêng", labelConfidence: "descriptive_only" };
  if (path.length === 2 && via === "step_parent") return { label: "cha/mẹ kế", labelConfidence: "descriptive_only" };
  if (path.length === 2 && via === "partner") return { label: "bạn đời", labelConfidence: "descriptive_only" };
  if (path.length === 3 && path[1]?.via === "parent" && path[2]?.via === "child") return { label: "anh/chị/em (chưa xác định thứ tự)", labelConfidence: "descriptive_only" };
  return { label: `Đường nối theo dữ liệu: ${path.slice(1).map((step) => step.via).join(" → ")}`, labelConfidence: "descriptive_only" };
}
function notFound(visitedCount = 0): Kinship {
  return {
    status: "not_found_within_visible_graph",
    paths: [],
    label: null,
    labelConfidence: "unknown",
    visitedCount,
    truncated: false
  };
}

export function findKinshipPaths(input: KinshipInput): Kinship {
  const maxSteps = input.maxSteps ?? 12;
  const maxVisited = input.maxVisited ?? 10_000;
  const maxDurationMs = input.maxDurationMs ?? 500;
  const now = input.now ?? (() => Date.now());
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 12) throw new RangeError("maxSteps must be between 1 and 12");
  if (!Number.isInteger(maxVisited) || maxVisited < 1 || maxVisited > 10_000) throw new RangeError("maxVisited must be between 1 and 10000");
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 500) throw new RangeError("maxDurationMs must be between 1 and 500");
  const startedAt = now();

  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const from = peopleById.get(input.fromPersonId);
  const to = peopleById.get(input.toPersonId);
  if (!from || !to) return notFound();

  const adjacency = new Map<string, Neighbor[]>();
  const add = (sourcePersonId: string, neighbor: Neighbor) => {
    const neighbors = adjacency.get(sourcePersonId) ?? [];
    neighbors.push(neighbor);
    adjacency.set(sourcePersonId, neighbors);
  };
  for (const edge of input.edges) {
    if (edge.status !== "confirmed") continue;
    if (!peopleById.has(edge.sourcePersonId) || !peopleById.has(edge.targetPersonId)) continue;
    if (edge.kind === "adoptive" && input.includeAdoptive === false) continue;
    if (edge.kind === "union") {
      add(edge.sourcePersonId, { personId: edge.targetPersonId, via: "partner" });
      add(edge.targetPersonId, { personId: edge.sourcePersonId, via: "partner" });
      continue;
    }
    const parentVia = edge.kind === "adoptive" ? "adoptive_parent" : edge.kind === "guardian" ? "guardian_parent" : edge.kind === "step" ? "step_parent" : "parent";
    const childVia = edge.kind === "adoptive" ? "adoptive_child" : edge.kind === "guardian" ? "guardian_child" : edge.kind === "step" ? "step_child" : "child";
    add(edge.sourcePersonId, { personId: edge.targetPersonId, via: childVia });
    add(edge.targetPersonId, { personId: edge.sourcePersonId, via: parentVia });
  }
  for (const neighbors of adjacency.values()) neighbors.sort((left, right) => `${left.personId}:${left.via}`.localeCompare(`${right.personId}:${right.via}`));

  const queue: QueueItem[] = [{ personId: from.id, pathIds: [from.id], path: [{ person: from, via: "start" }] }];
  const bestDepth = new Map<string, number>([[from.id, 0]]);
  const visited = new Set<string>();
  const resultPaths: Kinship["paths"] = [];
  const resultKeys = new Set<string>();
  let foundDepth: number | null = null;
  let truncated = false;

  while (queue.length > 0) {
    if (now() - startedAt >= maxDurationMs) {
      truncated = true;
      break;
    }
    const current = queue.shift();
    if (!current) break;
    const depth = current.pathIds.length - 1;
    if (foundDepth !== null && depth > foundDepth) break;
    visited.add(current.personId);
    if (current.personId === to.id) {
      const key = current.pathIds.join("/");
      if (!resultKeys.has(key)) {
        resultKeys.add(key);
        resultPaths.push(current.path);
      }
      foundDepth = depth;
      if (resultPaths.length >= 3) break;
      continue;
    }
    const neighbors = adjacency.get(current.personId) ?? [];
    if (depth >= maxSteps) {
      if (neighbors.some((neighbor) => !current.pathIds.includes(neighbor.personId))) truncated = true;
      continue;
    }
    for (const neighbor of neighbors) {
      if (current.pathIds.includes(neighbor.personId)) continue;
      const discoveredCount = visited.size + new Set(queue.map((item) => item.personId)).size;
      if (!visited.has(neighbor.personId) && discoveredCount >= maxVisited) {
        truncated = true;
        break;
      }
      const nextDepth = depth + 1;
      const previousDepth = bestDepth.get(neighbor.personId);
      if (previousDepth !== undefined && nextDepth > previousDepth) continue;
      if (previousDepth === undefined || nextDepth < previousDepth) bestDepth.set(neighbor.personId, nextDepth);
      const person = peopleById.get(neighbor.personId);
      if (!person) continue;
      queue.push({
        personId: neighbor.personId,
        pathIds: [...current.pathIds, neighbor.personId],
        path: [...current.path, { person, via: neighbor.via }]
      });
    }
    if (truncated) break;
  }

  if (resultPaths.length > 0) {
    const relationship = inferKinshipLabel(resultPaths[0]!);
    return { status: "found", paths: resultPaths, ...relationship, visitedCount: visited.size, truncated };
  }
  return {
    status: truncated ? "limit_reached" : "not_found_within_visible_graph",
    paths: [],
    label: null,
    labelConfidence: "unknown",
    visitedCount: visited.size,
    truncated
  };
}