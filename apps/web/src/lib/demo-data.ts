import fixture from "../../../../fixtures/demo-family.json";

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
