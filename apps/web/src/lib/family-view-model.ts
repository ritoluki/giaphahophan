/** Display adapter for an already-authorized set of people and relationships.
 * It never derives parenthood from a marriage or from a union's child list.
 */
export type FamilyPerson = {
  id: string;
  displayName: string;
  yearLabel: string;
  primaryBranchId: string | null;
};

export type FamilyParentLink = {
  id: string;
  parentId: string;
  childId: string;
  kind: "biological" | "adoptive" | "guardian" | "step";
  status: "confirmed" | "disputed";
};

export type FamilyUnion = {
  id: string;
  partnerIds: readonly string[];
  kind: "marriage" | "partnership" | "unknown";
  status: "married" | "widowed" | "divorced" | "separated" | "unknown";
};

export type FamilyDataset = {
  people: readonly FamilyPerson[];
  parentLinks: readonly FamilyParentLink[];
  unions: readonly FamilyUnion[];
};

export type FamilyMember = {
  person: FamilyPerson;
  relationshipLabels: string[];
  needsReview: boolean;
};

export type FamilyView = {
  person: FamilyPerson;
  parents: FamilyMember[];
  partners: FamilyMember[];
  children: FamilyMember[];
  needsReview: boolean;
};

export type FamilyMode = "family" | "ancestors" | "descendants";
export type FamilyViewOptions = {
  rootId: string | null;
  view: "family" | "diagram";
  mode: FamilyMode;
  depth: number;
  branchId: string | null;
};

const parentLabels: Record<FamilyParentLink["kind"], string> = {
  biological: "Cha mẹ ruột",
  adoptive: "Cha mẹ nuôi",
  guardian: "Người giám hộ",
  step: "Cha dượng hoặc mẹ kế"
};
const childLabels: Record<FamilyParentLink["kind"], string> = {
  biological: "Con ruột",
  adoptive: "Con nuôi",
  guardian: "Người được giám hộ",
  step: "Con riêng của vợ hoặc chồng"
};
const unionLabels: Record<FamilyUnion["status"], string> = {
  married: "Vợ hoặc chồng",
  widowed: "Vợ hoặc chồng đã mất",
  divorced: "Đã ly hôn",
  separated: "Đã chia tay hoặc ly thân",
  unknown: "Chưa rõ tình trạng hôn phối"
};

export function parentRelationshipLabel(link: FamilyParentLink, direction: "parent" | "child"): string {
  const label = (direction === "parent" ? parentLabels : childLabels)[link.kind];
  return link.status === "disputed" ? `${label} · Cần đối chiếu` : label;
}

export function partnerRelationshipLabel(union: FamilyUnion): string {
  if (union.status === "unknown") return union.kind === "partnership" ? "Bạn đời" : unionLabels.unknown;
  // A widowed union alone does not identify which partner has died.
  if (union.status === "widowed") return "Quan hệ hôn phối đã ghi nhận";
  return unionLabels[union.status];
}

function mergeMembers(entries: FamilyMember[]): FamilyMember[] {
  const members = new Map<string, FamilyMember>();
  for (const entry of entries) {
    const existing = members.get(entry.person.id);
    if (!existing) members.set(entry.person.id, entry);
    else {
      existing.relationshipLabels = [...new Set([...existing.relationshipLabels, ...entry.relationshipLabels])];
      existing.needsReview ||= entry.needsReview;
    }
  }
  return [...members.values()].sort((a, b) => a.person.displayName.localeCompare(b.person.displayName, "vi") || a.person.id.localeCompare(b.person.id));
}

export function buildFamilyView(dataset: FamilyDataset, rootId: string): FamilyView | null {
  const people = new Map(dataset.people.map((person) => [person.id, person]));
  const person = people.get(rootId);
  if (!person) return null;
  const members = (direction: "parent" | "child") => mergeMembers(dataset.parentLinks.flatMap((link): FamilyMember[] => {
    if ((direction === "parent" ? link.childId : link.parentId) !== rootId) return [];
    const relative = people.get(direction === "parent" ? link.parentId : link.childId);
    if (!relative || relative.id === rootId) return [];
    return [{ person: relative, relationshipLabels: [parentRelationshipLabel(link, direction)], needsReview: link.status === "disputed" }];
  }));
  const partners = mergeMembers(dataset.unions.flatMap((union): FamilyMember[] => {
    if (!union.partnerIds.includes(rootId)) return [];
    return union.partnerIds.flatMap((id): FamilyMember[] => {
      const partner = people.get(id);
      return partner && id !== rootId ? [{ person: partner, relationshipLabels: [partnerRelationshipLabel(union)], needsReview: false }] : [];
    });
  }));
  const parents = members("parent");
  const children = members("child");
  return { person, parents, partners, children, needsReview: [...parents, ...children].some((member) => member.needsReview) };
}

export function readFamilyOptions(params: Pick<URLSearchParams, "get">, allowedPeople: readonly FamilyPerson[], allowedBranchIds: readonly string[]): FamilyViewOptions {
  const requestedRoot = params.get("root");
  const requestedMode = params.get("mode");
  const requestedDepth = Number(params.get("depth") ?? 2);
  const requestedBranch = params.get("branch");
  return {
    rootId: allowedPeople.some((person) => person.id === requestedRoot) ? requestedRoot : null,
    view: params.get("view") === "diagram" ? "diagram" : "family",
    mode: requestedMode === "ancestors" || requestedMode === "descendants" ? requestedMode : "family",
    depth: Number.isInteger(requestedDepth) && requestedDepth >= 1 && requestedDepth <= 6 ? requestedDepth : 2,
    branchId: requestedBranch && allowedBranchIds.includes(requestedBranch) ? requestedBranch : null
  };
}

export function familyHref(options: FamilyViewOptions): string {
  const params = new URLSearchParams();
  if (options.rootId) params.set("root", options.rootId);
  if (options.view === "diagram" && options.rootId) params.set("view", "diagram");
  if (options.mode !== "family") params.set("mode", options.mode);
  if (options.depth !== 2) params.set("depth", String(options.depth));
  if (options.branchId) params.set("branch", options.branchId);
  return `/gia-pha${params.size ? `?${params.toString()}` : ""}`;
}

export function normalizeFamilySearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi").trim();
}

export type FamilyDiagramEdge = {
  id: string;
  source: string;
  target: string;
  kind: FamilyParentLink["kind"] | "union";
  disputed: boolean;
  label: string;
};
export type FamilyDiagram = { people: FamilyPerson[]; edges: FamilyDiagramEdge[]; truncated: boolean };

/** Layout lanes only, never a recorded or absolute generation number. */
export function familyDiagramLanes(diagram: FamilyDiagram, rootId: string): Map<string, number> {
  const lanes = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (!id) continue;
    const lane = lanes.get(id) ?? 0;
    for (const edge of diagram.edges) {
      const next = edge.source === id ? edge.target : edge.target === id ? edge.source : null;
      if (!next || lanes.has(next)) continue;
      lanes.set(next, lane + (edge.kind === "union" ? 0 : edge.source === id ? 1 : -1));
      queue.push(next);
    }
  }
  return lanes;
}

export function buildFamilyDiagram(dataset: FamilyDataset, options: FamilyViewOptions, maxNodes = 120): FamilyDiagram {
  if (!options.rootId || !dataset.people.some((person) => person.id === options.rootId)) return { people: [], edges: [], truncated: false };
  const cap = Math.min(300, Math.max(1, Math.trunc(maxNodes)));
  const people = new Map(dataset.people.map((person) => [person.id, person]));
  const parentLinks = dataset.parentLinks.filter((link) => people.has(link.parentId) && people.has(link.childId) && link.parentId !== link.childId);
  const unionEdges = dataset.unions.flatMap((union) => union.partnerIds.flatMap((source, index) => union.partnerIds.slice(index + 1).flatMap((target) => {
    return source !== target && people.has(source) && people.has(target) ? [{ id: `${union.id}:${source}:${target}`, source, target, kind: "union" as const, disputed: false, label: partnerRelationshipLabel(union) }] : [];
  })));
  const selected = new Set<string>([options.rootId]);
  let frontier = [options.rootId];
  let truncated = false;
  for (let level = 0; level < options.depth && frontier.length; level++) {
    const next: string[] = [];
    for (const id of frontier) {
      const candidates = parentLinks.flatMap((link) => {
        if (options.mode !== "family" && (link.status !== "confirmed" || (link.kind !== "biological" && link.kind !== "adoptive"))) return [];
        if (link.childId === id && options.mode !== "descendants") return [link.parentId];
        if (link.parentId === id && options.mode !== "ancestors") return [link.childId];
        return [];
      });
      if (options.mode === "family") for (const edge of unionEdges) {
        if (edge.source === id) candidates.push(edge.target);
        else if (edge.target === id) candidates.push(edge.source);
      }
      for (const candidate of candidates) {
        if (selected.has(candidate)) continue;
        // A branch filter narrows navigation without inferring links across excluded people.
        if (options.branchId && people.get(candidate)?.primaryBranchId !== options.branchId) continue;
        if (selected.size >= cap) { truncated = true; continue; }
        selected.add(candidate);
        next.push(candidate);
      }
    }
    frontier = next;
  }
  const edges: FamilyDiagramEdge[] = parentLinks.filter((link) => selected.has(link.parentId) && selected.has(link.childId)).map((link) => ({
    id: link.id,
    source: link.parentId,
    target: link.childId,
    kind: link.kind,
    disputed: link.status === "disputed",
    label: parentRelationshipLabel(link, "child")
  }));
  return {
    people: [...selected].flatMap((id) => { const person = people.get(id); return person ? [person] : []; }),
    edges: [...edges, ...unionEdges.filter((edge) => selected.has(edge.source) && selected.has(edge.target))],
    truncated
  };
}
