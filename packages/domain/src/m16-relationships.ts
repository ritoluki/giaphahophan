import { z } from "zod";
import { importRelationshipMappingSchema, type ImportRelationshipMapping } from "@phan/contracts";

const ref = z.string().trim().min(1).max(300);
const sourceSchema = z.object({
  version: z.number().int().positive(), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  records: z.array(z.object({
    xref: ref,
    normalized: z.object({
      recordType: z.string().min(1).max(40),
      partnerRefs: z.array(z.object({ xref: ref, sourceTag: z.enum(["HUSB", "WIFE"]) })).max(100).optional(),
      childRefs: z.array(ref).max(1000).optional(),
    }),
  })).max(10000),
  excludedExternalIds: z.array(ref).max(10000),
});
export type ImportRelationshipIssue = "INVALID_SOURCE" | "INVALID_MAPPING" | "STALE_SNAPSHOT" | "DUPLICATE_EXTERNAL_ID"
  | "DUPLICATE_FAMILY_DECISION" | "UNAVAILABLE_FAMILY" | "UNAVAILABLE_PERSON" | "REFERENCE_NOT_IN_SOURCE"
  | "DUPLICATE_PARTICIPANT" | "SELF_PARENT" | "DUPLICATE_PARENT_LINK" | "BIOLOGICAL_PARENT_LIMIT" | "ANCESTRY_CYCLE" | "RELATIONSHIP_LIMIT";
export type ImportRelationshipPlan = { status: "valid"; mappings: ImportRelationshipMapping[]; parentLinkCount: number }
  | { status: "invalid"; issues: ImportRelationshipIssue[] };

/** Private dry-run only: never infers parentage, recorded sex or canonical IDs. DB apply must independently recheck under ancestry lock. */
export function planImportRelationships(sourceInput: unknown, decisionsInput: unknown): ImportRelationshipPlan {
  if (Array.isArray(decisionsInput)) {
    let work = 0;
    for (const decision of decisionsInput) {
      if (decision && typeof decision === "object") for (const key of ["parentLinks", "partnerExternalIds", "childExternalIds"] as const) {
        const items: unknown = Reflect.get(decision, key);
        if (Array.isArray(items)) work += items.length;
      }
      if (work > 20000) return { status: "invalid", issues: ["RELATIONSHIP_LIMIT"] };
    }
  }
  const source = sourceSchema.safeParse(sourceInput);
  if (!source.success) return { status: "invalid", issues: ["INVALID_SOURCE"] };
  const decisions = z.array(importRelationshipMappingSchema).max(1000).safeParse(decisionsInput);
  if (!decisions.success) return { status: "invalid", issues: ["INVALID_MAPPING"] };
  if (decisions.data.reduce((count, mapping) => count + mapping.parentLinks.length + mapping.partnerExternalIds.length + mapping.childExternalIds.length, 0) > 20000) {
    return { status: "invalid", issues: ["RELATIONSHIP_LIMIT"] };
  }
  const issues = new Set<ImportRelationshipIssue>();
  const records = new Map(source.data.records.map((record) => [record.xref, record]));
  if (records.size !== source.data.records.length) issues.add("DUPLICATE_EXTERNAL_ID");
  const excluded = new Set(source.data.excludedExternalIds);
  const families = new Set<string>();
  const edges = new Set<string>();
  const biological = new Map<string, Set<string>>();
  const adjacency = new Map<string, Set<string>>();
  const indegrees = new Map<string, number>();
  let parentLinkCount = 0;
  for (const mapping of decisions.data) {
    if (mapping.baseVersion !== source.data.version || mapping.snapshotHash !== source.data.snapshotHash) issues.add("STALE_SNAPSHOT");
    if (families.has(mapping.familyExternalId)) issues.add("DUPLICATE_FAMILY_DECISION");
    families.add(mapping.familyExternalId);
    const family = records.get(mapping.familyExternalId);
    if (family?.normalized.recordType !== "FAM" || excluded.has(mapping.familyExternalId)) { issues.add("UNAVAILABLE_FAMILY"); continue; }
    const partners = new Set(mapping.partnerExternalIds);
    const children = new Set(mapping.childExternalIds);
    if (partners.size !== mapping.partnerExternalIds.length || children.size !== mapping.childExternalIds.length) issues.add("DUPLICATE_PARTICIPANT");
    const sourcePartners = new Set(family.normalized.partnerRefs?.map((item) => item.xref) ?? []);
    const sourceChildren = new Set(family.normalized.childRefs ?? []);
    for (const [selected, available] of [[partners, sourcePartners], [children, sourceChildren]] as const) {
      for (const person of selected) {
        if (!available.has(person)) issues.add("REFERENCE_NOT_IN_SOURCE");
        if (records.get(person)?.normalized.recordType !== "INDI" || excluded.has(person)) issues.add("UNAVAILABLE_PERSON");
      }
    }
    for (const edge of mapping.parentLinks) {
      parentLinkCount++;
      const parent = edge.parentExternalId, child = edge.childExternalId;
      if (!partners.has(parent) || !children.has(child)) issues.add("REFERENCE_NOT_IN_SOURCE");
      if (parent === child) issues.add("SELF_PARENT");
      const edgeKey = JSON.stringify([parent, child, edge.kind]);
      if (edges.has(edgeKey)) issues.add("DUPLICATE_PARENT_LINK");
      edges.add(edgeKey);
      if (edge.status !== "confirmed") continue;
      if (edge.kind === "biological") {
        const parents = biological.get(child) ?? new Set<string>();
        parents.add(parent); biological.set(child, parents);
        if (parents.size > 2) issues.add("BIOLOGICAL_PARENT_LIMIT");
      }
      if (edge.kind !== "biological" && edge.kind !== "adoptive") continue;
      if (!indegrees.has(parent)) indegrees.set(parent, 0);
      if (!indegrees.has(child)) indegrees.set(child, 0);
      const descendants = adjacency.get(parent) ?? new Set<string>();
      if (!descendants.has(child)) { descendants.add(child); indegrees.set(child, (indegrees.get(child) ?? 0) + 1); }
      adjacency.set(parent, descendants);
    }
  }
  const queue = [...indegrees].filter(([, degree]) => degree === 0).map(([person]) => person);
  let visited = 0;
  for (let index = 0; index < queue.length; index++) {
    const person = queue[index]!; visited++;
    for (const child of adjacency.get(person) ?? []) {
      const degree = (indegrees.get(child) ?? 0) - 1; indegrees.set(child, degree);
      if (degree === 0) queue.push(child);
    }
  }
  if (visited !== indegrees.size) issues.add("ANCESTRY_CYCLE");
  return issues.size ? { status: "invalid", issues: [...issues].sort() } : { status: "valid", mappings: decisions.data, parentLinkCount };
}
