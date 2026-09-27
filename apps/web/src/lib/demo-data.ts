import fixture from "../../../../fixtures/demo-family.json";
import { buildGraphProjection, findKinshipPaths, type GraphMode, type GraphParentLink, type GraphUnion, type KinshipEdge } from "@phan/domain";
import type { Graph } from "@phan/contracts";

export type DemoPersonSummary = {
  id: string;
  code: string;
  displayName: string;
  lifeStatus: "living" | "deceased" | "unknown";
  primaryBranchId: string | null;
  yearLabel: string;
  isDemo: true;
};

export type DemoFamilyFocus = {
  person: DemoPersonSummary;
  parents: DemoPersonSummary[];
  children: DemoPersonSummary[];
  links: Array<{ id: string; kind: string; status: string }>;
};

export type DemoPersonRecord = (typeof fixture.persons)[number];

export type DemoSource = {
  id: string;
  title: string;
  kind: string;
  provenance: string;
};

function normalizeLifeStatus(value: string): DemoPersonSummary["lifeStatus"] {
  if (value === "living" || value === "deceased") return value;
  return "unknown";
}

const summaries = fixture.persons.map<DemoPersonSummary>((person) => ({
  id: person.id,
  code: person.externalId,
  displayName: person.displayName,
  lifeStatus: normalizeLifeStatus(person.lifeStatus),
  primaryBranchId: person.branchId ?? null,
  yearLabel: person.birth?.year ? String(person.birth.year) : "Chưa rõ",
  isDemo: true
}));

const summaryById = new Map(summaries.map((person) => [person.id, person]));
const recordById = new Map(fixture.persons.map((person) => [person.id, person]));

function uniquePeople(people: Array<DemoPersonSummary | undefined>): DemoPersonSummary[] {
  return Array.from(new Map(people.filter((person): person is DemoPersonSummary => Boolean(person)).map((person) => [person.id, person])).values());
}

export const demoTree = {
  id: fixture.tree.id,
  name: fixture.tree.name,
  slug: fixture.tree.slug,
  warning: fixture.warning
};

export const demoBranches = fixture.branches.map((branch) => ({
  id: branch.id,
  code: branch.code,
  name: branch.name
}));

export const demoPeople = summaries;

export const demoSources: DemoSource[] = fixture.sources.map((source) => ({
  id: source.id,
  title: source.title,
  kind: source.kind,
  provenance: source.provenance
}));

export const demoEvents = fixture.eventRules.map((event) => ({
  id: event.id,
  title: event.title,
  lunarLabel: event.sourceDate.originalText,
  reviewStatus: event.reviewStatus,
  recurrence: event.recurrence
}));

export function findDemoPerson(id: string): DemoPersonRecord | undefined {
  return recordById.get(id);
}

export function findDemoSummary(id: string): DemoPersonSummary | undefined {
  return summaryById.get(id);
}

export function branchName(branchId: string | null): string {
  return demoBranches.find((branch) => branch.id === branchId)?.name ?? "Chưa xác định chi";
}

export function getFamilyFocus(personId = summaries[0]?.id): DemoFamilyFocus | null {
  if (!personId) return null;
  const person = summaryById.get(personId);
  if (!person) return null;

  const parentLinks = fixture.parentLinks.filter((link) => link.childId === personId);
  const childLinks = fixture.parentLinks.filter((link) => link.parentId === personId);

  return {
    person,
    parents: uniquePeople(parentLinks.map((link) => summaryById.get(link.parentId))),
    children: uniquePeople(childLinks.map((link) => summaryById.get(link.childId))),
    links: [...parentLinks, ...childLinks].map((link) => ({ id: link.id, kind: link.kind, status: link.status }))
  };
}

function graphParentKind(value: string): GraphParentLink["kind"] {
  if (value === "biological" || value === "adoptive" || value === "guardian" || value === "step") return value;
  throw new Error("Invalid synthetic parent-link kind");
}

function graphParentStatus(value: string): GraphParentLink["status"] {
  if (value === "confirmed" || value === "disputed") return value;
  throw new Error("Invalid synthetic parent-link status");
}

export function getDemoKinship(fromPersonId: string, toPersonId: string, includeAdoptive = true) {
  const people = summaries.map((person) => ({ ...person, version: 1 }));
  const parentEdges: KinshipEdge[] = fixture.parentLinks
    .filter((link) => link.kind === "biological" || link.kind === "adoptive")
    .map((link) => ({ sourcePersonId: link.parentId, targetPersonId: link.childId, kind: link.kind === "adoptive" ? "adoptive" as const : "biological" as const, status: link.status === "confirmed" ? "confirmed" as const : "disputed" as const }));
  const unionEdges: KinshipEdge[] = fixture.unions.flatMap((union) => union.partnerIds.flatMap((sourcePersonId, index) => union.partnerIds.slice(index + 1).map((targetPersonId) => ({ sourcePersonId, targetPersonId, kind: "union" as const, status: "confirmed" as const }))));
  return findKinshipPaths({ fromPersonId, toPersonId, people, edges: [...parentEdges, ...unionEdges], includeAdoptive });
}
export function getDemoGraph(personId: string, mode: GraphMode, depth = 3, maxNodes = 120): Graph {
  const people = summaries.map((person) => ({ ...person, version: 1 }));
  const parentLinks: GraphParentLink[] = fixture.parentLinks.map((link) => ({
    id: link.id,
    parentId: link.parentId,
    childId: link.childId,
    kind: graphParentKind(link.kind),
    status: graphParentStatus(link.status)
  }));
  const unions: GraphUnion[] = fixture.unions.map((union) => ({
    id: union.id,
    partnerIds: union.partnerIds,
    childIds: union.childIds
  }));
  return buildGraphProjection({
    rootPersonId: personId,
    people,
    parentLinks,
    unions,
    graphRevision: 1
  }, mode, depth, maxNodes);
}
