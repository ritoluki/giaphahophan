import { z } from "zod";

export type * from "../../../contracts/domain.types";

export const genealogyDateSchema = z.object({
  calendar: z.enum(["gregorian", "vietnamese_lunar", "julian", "unknown"]),
  precision: z.enum(["exact", "month", "month_day", "year", "about", "before", "after", "range", "text", "unknown"]),
  year: z.number().int().min(-5000).max(5000).optional(),
  month: z.number().int().min(1).max(13).optional(),
  day: z.number().int().min(1).max(31).optional(),
  isLeapMonth: z.boolean().optional(),
  originalText: z.string().min(1),
  rangeEnd: z.object({ year: z.number().int(), month: z.number().int().min(1).max(13).optional(), day: z.number().int().min(1).max(31).optional() }).optional(),
  timezone: z.literal("Asia/Ho_Chi_Minh").optional()
}).superRefine((value, context) => {
  if (value.precision === "year" && (value.month !== undefined || value.day !== undefined)) {
    context.addIssue({ code: "custom", path: ["precision"], message: "Year precision cannot include month or day" });
  }
  if (value.precision === "month_day" && (value.month === undefined || value.day === undefined || value.year !== undefined)) {
    context.addIssue({ code: "custom", path: ["precision"], message: "Month-day precision requires month/day and omits year" });
  }
  if (value.calendar !== "vietnamese_lunar" && value.isLeapMonth === true) {
    context.addIssue({ code: "custom", path: ["isLeapMonth"], message: "Leap month only applies to Vietnamese lunar dates" });
  }
});

export const personSummarySchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  code: z.string().min(1),
  displayName: z.string().min(1),
  lifeStatus: z.enum(["living", "deceased", "unknown"]),
  primaryBranchId: z.string().uuid().nullable().optional(),
  yearLabel: z.string().optional(),
  portraitAssetId: z.string().uuid().nullable().optional(),
  isDemo: z.boolean()
});

export const personProjectionSchema = z.object({
  id: z.string().uuid(),
  treeId: z.string().uuid(),
  code: z.string().min(1),
  displayName: z.string().min(1),
  recordedSex: z.enum(["M", "F", "X", "U"]).nullable(),
  lifeStatus: z.enum(["living", "deceased", "unknown"]),
  visibility: z.enum(["public", "members", "restricted"]),
  protectedMinor: z.boolean(),
  primaryBranchId: z.string().uuid().nullable(),
  confidence: z.enum(["unverified", "supported", "verified", "disputed"])
});

export const proposalKindSchema = z.enum(["correction", "addition", "relationship", "merge", "publication"]);
export const legacyProposalItemSchema = z.object({
  targetKind: z.enum(["person", "fact", "parent_link", "union", "branch", "merge", "publication"]),
  targetId: z.string().uuid().nullable().optional(),
  baseVersion: z.number().int().positive().nullable().optional(),
  operation: z.enum(["create", "update", "delete", "merge", "publish"]),
  fieldChanges: z.record(z.string(), z.unknown()),
  sourceIds: z.array(z.string().uuid()).max(50).default([])
});

const personProposalFieldChangesSchema = z.object({
  display_name: z.string().min(1).max(500).optional(),
  recorded_sex: z.enum(['M', 'F', 'X', 'U']).nullable().optional(),
  life_status: z.enum(['living', 'deceased', 'unknown']).optional(),
  visibility: z.enum(['public', 'members', 'restricted']).optional(),
  protected_minor: z.boolean().optional(),
  primary_branch_id: z.string().uuid().nullable().optional(),
  biography: z.string().max(20000).nullable().optional(),
  confidence: z.enum(['unverified', 'supported', 'verified', 'disputed']).optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one person field is required');

const parentLinkCreateFieldChangesSchema = z.object({
  parent_id: z.string().uuid(),
  child_id: z.string().uuid(),
  kind: z.enum(['biological', 'adoptive', 'guardian', 'step']),
  status: z.enum(['confirmed', 'disputed']),
  ordinal: z.number().int().positive().nullable().optional(),
  source_id: z.string().uuid()
}).strict();

const parentLinkDeleteFieldChangesSchema = z.object({}).strict();

export const proposalItemSchema = z.union([
  z.object({
    targetKind: z.literal('person'),
    targetId: z.string().uuid(),
    baseVersion: z.number().int().positive(),
    operation: z.literal('update'),
    fieldChanges: personProposalFieldChangesSchema,
    sourceIds: z.array(z.string().uuid()).max(50).default([])
  }).strict(),
  z.object({
    targetKind: z.literal('parent_link'),
    targetId: z.null().optional(),
    baseVersion: z.null().optional(),
    operation: z.literal('create'),
    fieldChanges: parentLinkCreateFieldChangesSchema,
    sourceIds: z.array(z.string().uuid()).min(1).max(50)
  }).strict(),
  z.object({
    targetKind: z.literal('parent_link'),
    targetId: z.string().uuid(),
    baseVersion: z.number().int().positive(),
    operation: z.literal('delete'),
    fieldChanges: parentLinkDeleteFieldChangesSchema,
    sourceIds: z.array(z.string().uuid()).min(1).max(50)
  }).strict()
]);

export const proposalSubmitInputSchema = z.object({
  treeId: z.string().uuid(),
  kind: proposalKindSchema,
  reason: z.string().trim().min(1).max(4000),
  branchId: z.string().uuid().nullable().optional(),
  baseSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  items: z.array(proposalItemSchema).min(1).max(100)
});

export const proposalReviewInputSchema = z.object({
  proposalId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "needs_info"]),
  reason: z.string().trim().min(1).max(4000),
  baseVersion: z.number().int().positive(),
  reviewedSnapshotHash: z.string().trim().min(1).max(256)
});

export const proposalMutationResultSchema = z.object({
  id: z.string().uuid(),
  treeId: z.string().uuid(),
  status: z.enum(["submitted", "needs_info", "approved", "rejected"]),
  version: z.number().int().positive()
});

export const loginInputSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128)
});

export const idempotencyKeySchema = z.string().uuid();

export const apiMetaSchema = z.object({ requestId: z.string().min(1), version: z.number().int().positive().optional() });
export const errorResponseSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), fieldErrors: z.record(z.string(), z.array(z.string())).optional(), requestId: z.string(), retryable: z.boolean() }) });

export function assertValidGenealogyDate(value: unknown): asserts value is z.infer<typeof genealogyDateSchema> {
  genealogyDateSchema.parse(value);
}
