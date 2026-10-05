import { z } from "zod";
import { genealogyDateSchema } from "./genealogy-date";

export const exportFormatSchema = z.enum(["canonical_json", "csv", "gedcom_551", "gedcom_7", "book_pdf", "svg"]);
export const exportScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("personal"), personId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("tree") }).strict(),
  z.object({ kind: z.literal("branch"), branchId: z.string().uuid() }).strict(),
]);
export const exportRequestSchema = z.object({
  treeId: z.string().uuid(), format: exportFormatSchema, scope: exportScopeSchema,
  reason: z.string().trim().min(5).max(1000), includeMedia: z.boolean(), audience: z.enum(["self", "members", "public"]),
}).strict().superRefine((value, context) => {
  if ((value.scope.kind === "personal") !== (value.audience === "self")) context.addIssue({ code: "custom", path: ["audience"], message: "Self audience requires approved personal scope" });
});

// A serializer consumes ONLY a server-authorized projection. This schema is not
// authorization: creation, processing and download must independently recheck DB policy.
const exportDateSchema = genealogyDateSchema.safeExtend({
  rangeEnd: genealogyDateSchema.shape.rangeEnd.unwrap().strict().optional(),
}).strict();
const exportPersonSchema = z.object({
  id: z.string().uuid(), version: z.number().int().positive(), code: z.string().min(1).max(100),
  displayName: z.string().min(1).max(1000),
  names: z.array(z.object({ name: z.string().min(1).max(1000), kind: z.enum(["birth", "preferred", "alias", "religious", "other"]) }).strict()).max(100),
  recordedSex: z.enum(["M", "F", "X", "U"]).nullable(),
  lifeStatus: z.enum(["living", "deceased", "unknown"]).nullable(),
  facts: z.array(z.object({
    id: z.string().uuid(), kind: z.enum(["birth", "death", "burial", "occupation", "other"]),
    valueDate: exportDateSchema.nullable(), valueText: z.string().max(10000).nullable(),
    confidence: z.enum(["unverified", "supported", "verified", "disputed"]),
  }).strict()).max(1000),
}).strict();
const exportParentLinkSchema = z.object({
  id: z.string().uuid(), parentId: z.string().uuid(), childId: z.string().uuid(),
  kind: z.enum(["biological", "adoptive", "guardian", "step", "unknown"]),
  status: z.enum(["confirmed", "disputed", "unknown"]),
}).strict();
const exportSourceSchema = z.object({ id: z.string().uuid(), title: z.string().min(1).max(1000) }).strict();
const exportUnionSchema = z.object({
  id: z.string().uuid(), kind: z.enum(["marriage", "partnership", "unknown"]), status: z.enum(["active", "separated", "divorced", "widowed", "unknown"]),
  partnerIds: z.array(z.string().uuid()).max(100), childIds: z.array(z.string().uuid()).max(1000),
}).strict();
const exportCitationSchema = z.object({
  id: z.string().uuid(), sourceId: z.string().uuid(),
  targetKind: z.enum(["person", "fact", "parent_link", "union"]), targetId: z.string().uuid(),
  locator: z.string().max(2000).nullable(),
}).strict();
export const exportProjectionSchema = z.object({
  schemaVersion: z.literal("phan-export/1"), treeId: z.string().uuid(),
  policyVersion: z.number().int().positive(), generatedAt: z.string().datetime({ offset: true }),
  isDemo: z.boolean(), scope: exportScopeSchema,
  people: z.array(exportPersonSchema).max(10000), parentLinks: z.array(exportParentLinkSchema).max(20000),
  unions: z.array(exportUnionSchema).max(10000),
  sources: z.array(exportSourceSchema).max(10000), citations: z.array(exportCitationSchema).max(50000),
}).strict().superRefine((value, context) => {
  const people = new Set(value.people.map((person) => person.id));
  const facts = new Set(value.people.flatMap((person) => person.facts.map((fact) => fact.id)));
  const links = new Set(value.parentLinks.map((link) => link.id));
  const sources = new Set(value.sources.map((source) => source.id));
  const unions = new Set(value.unions.map((union) => union.id));
  for (const [key, rows] of Object.entries({ people: value.people, parentLinks: value.parentLinks, unions: value.unions, sources: value.sources, citations: value.citations })) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) context.addIssue({ code: "custom", path: [key], message: "Duplicate projected ID" });
  }
  if (facts.size !== value.people.reduce((sum, person) => sum + person.facts.length, 0)) context.addIssue({ code: "custom", path: ["people"], message: "Duplicate projected fact ID" });
  value.parentLinks.forEach((link, index) => {
    if (!people.has(link.parentId) || !people.has(link.childId) || link.parentId === link.childId) context.addIssue({ code: "custom", path: ["parentLinks", index], message: "Relationship endpoint is outside authorized projection" });
  });
  value.citations.forEach((citation, index) => {
    const targets = citation.targetKind === "person" ? people : citation.targetKind === "fact" ? facts : citation.targetKind === "union" ? unions : links;
    if (!sources.has(citation.sourceId) || !targets.has(citation.targetId)) context.addIssue({ code: "custom", path: ["citations", index], message: "Citation target/source is outside authorized projection" });
  });
  value.unions.forEach((union, index) => {
    if ([...union.partnerIds, ...union.childIds].some((id) => !people.has(id))
      || new Set(union.partnerIds).size !== union.partnerIds.length || new Set(union.childIds).size !== union.childIds.length) {
      context.addIssue({ code: "custom", path: ["unions", index], message: "Union contains duplicate or unauthorized participants" });
    }
  });
  if (value.scope.kind === "personal" && (value.people.length !== 1 || !people.has(value.scope.personId))) context.addIssue({ code: "custom", path: ["scope"], message: "Personal scope must contain exactly its approved person" });
});
export type ExportProjection = z.infer<typeof exportProjectionSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export const exportJobSchema = z.object({
  id: z.string().uuid(), treeId: z.string().uuid(), version: z.number().int().positive(),
  format: exportFormatSchema, scope: exportScopeSchema, policyVersion: z.number().int().positive(),
  audience: z.enum(["self", "members", "public"]), includeMedia: z.boolean(),
  status: z.enum(["queued", "running", "complete", "failed", "cancelled"]),
  expiresAt: z.string().datetime({ offset: true }), warnings: z.array(z.string().max(200)).max(200),
}).strict();
