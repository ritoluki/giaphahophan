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

export const personSearchMatchSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["birth", "preferred", "alias", "religious", "other"])
}).strict();

export const personSearchResultSchema = personSummarySchema.extend({
  matchedNames: z.array(personSearchMatchSchema).max(10)
}).strict();

export const personSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default("").refine((value) => value.length === 0 || value.length >= 2, "Search requires at least two characters"),
  branchId: z.string().uuid().optional(),
  lifeStatus: z.enum(["living", "deceased", "unknown"]).optional(),
  birthYear: z.coerce.number().int().min(-5000).max(5000).optional(),
  sort: z.enum(["name", "code", "updated"]).default("name"),
  cursor: z.string().trim().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const personProjectionSchema = z.object({
  id: z.string().uuid(),
  treeId: z.string().uuid(),
  version: z.number().int().positive(),
  code: z.string().min(1),
  displayName: z.string().min(1),
  recordedSex: z.enum(["M", "F", "X", "U"]).nullable(),
  lifeStatus: z.enum(["living", "deceased", "unknown"]),
  visibility: z.enum(["public", "members", "restricted"]),
  protectedMinor: z.boolean(),
  primaryBranchId: z.string().uuid().nullable(),
  confidence: z.enum(["unverified", "supported", "verified", "disputed"])
});

export const personNameSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  name: z.string().min(1),
  nameSearch: z.string().min(1),
  kind: z.enum(["birth", "preferred", "alias", "religious", "other"]),
  isPreferred: z.boolean()
});

export const personIdentityProjectionSchema = personProjectionSchema.extend({
  names: z.array(personNameSchema)
});

export const personFactProjectionSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  kind: z.enum(["birth", "death", "burial", "occupation", "other"]),
  valueDate: genealogyDateSchema.nullable(),
  valueText: z.string().nullable(),
  confidence: z.enum(["unverified", "supported", "verified", "disputed"]),
  visibility: z.enum(["public", "members", "restricted"])
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

export const personProposalFieldChangesSchema = z.object({
  display_name: z.string().min(1).max(500).optional(),
  recorded_sex: z.enum(['M', 'F', 'X', 'U']).nullable().optional(),
  life_status: z.enum(['living', 'deceased', 'unknown']).optional(),
  visibility: z.enum(['public', 'members', 'restricted']).optional(),
  protected_minor: z.boolean().optional(),
  primary_branch_id: z.string().uuid().nullable().optional(),
  biography: z.string().max(20000).nullable().optional(),
  confidence: z.enum(['unverified', 'supported', 'verified', 'disputed']).optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one person field is required');

export const personCorrectionInputSchema = z.object({
  treeId: z.string().uuid(),
  reason: z.string().trim().min(1).max(4000),
  fieldChanges: personProposalFieldChangesSchema,
  sourceIds: z.array(z.string().uuid()).max(50).default([])
});

export const personDeletionInputSchema = z.object({
  treeId: z.string().uuid(),
  reason: z.string().trim().min(1).max(4000)
});

export const personDeletionImpactSchema = z.object({
  personId: z.string().uuid(),
  treeId: z.string().uuid(),
  version: z.number().int().positive(),
  edgeCount: z.number().int().nonnegative(),
  factCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  edgeIds: z.array(z.string().uuid()),
  factIds: z.array(z.string().uuid()),
  sourceIds: z.array(z.string().uuid())
});

const parentLinkCreateFieldChangesSchema = z.object({
  parent_id: z.string().uuid(),
  child_id: z.string().uuid(),
  kind: z.enum(['biological', 'adoptive', 'guardian', 'step']),
  status: z.enum(['confirmed', 'disputed']),
  ordinal: z.number().int().positive().nullable().optional(),
  source_id: z.string().uuid()
}).strict();

const parentLinkDeleteFieldChangesSchema = z.object({}).strict();

const personCreateFieldChangesSchema = z.object({
  display_name: z.string().min(1).max(500),
  recorded_sex: z.enum(['M', 'F', 'X', 'U']).optional(),
  life_status: z.enum(['living', 'deceased', 'unknown']).default('unknown'),
  visibility: z.enum(['public', 'members', 'restricted']).default('restricted'),
  protected_minor: z.boolean().default(false),
  primary_branch_id: z.string().uuid().nullable().optional(),
  biography: z.string().max(20000).nullable().optional(),
  confidence: z.enum(['unverified', 'supported', 'verified', 'disputed']).default('unverified')
}).strict();

export const proposalItemSchema = z.union([
  z.object({
    targetKind: z.literal('person'),
    targetId: z.null(),
    baseVersion: z.null(),
    operation: z.literal('create'),
    fieldChanges: personCreateFieldChangesSchema,
    sourceIds: z.array(z.string().uuid()).min(1).max(50)
  }).strict(),
  z.object({
    targetKind: z.literal('person'),
    targetId: z.string().uuid(),
    baseVersion: z.number().int().positive(),
    operation: z.literal('update'),
    fieldChanges: personProposalFieldChangesSchema,
    sourceIds: z.array(z.string().uuid()).max(50).default([])
  }).strict(),
  z.object({
    targetKind: z.literal('person'),
    targetId: z.string().uuid(),
    baseVersion: z.number().int().positive(),
    operation: z.literal('delete'),
    fieldChanges: z.object({}).strict(),
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
  status: z.enum(["draft", "submitted", "needs_info", "approved", "rejected", "withdrawn"]),
  version: z.number().int().positive()
});

export const proposalLifecycleInputSchema = z.object({
  reason: z.string().trim().min(1).max(4000)
}).strict();

export const proposalHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["review", "event"]),
  status: z.enum(["drafted", "submitted", "needs_info", "approved", "rejected", "withdrawn"]),
  decision: z.enum(["approve", "reject", "needs_info"]).nullable(),
  reason: z.string().min(1),
  createdAt: z.string().datetime({ offset: true })
}).strict();

export const proposalHistorySchema = z.object({
  proposalId: z.string().uuid(),
  entries: z.array(proposalHistoryEntrySchema).max(200)
}).strict();


export const mediaStateSchema = z.enum([
  "requested", "uploading", "uploaded", "scanning", "processing",
  "ready", "rejected", "failed", "quarantined"
]);

export const mediaMimeTypeSchema = z.enum([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
  "audio/mpeg", "audio/mp4", "video/mp4"
]);

export const mediaPurposeSchema = z.enum(["portrait", "source", "album", "import", "receipt", "scholarship"]);
export const mediaVisibilitySchema = z.enum(["restricted", "members", "public"]);

export const mediaAssetSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  state: mediaStateSchema,
  mimeType: mediaMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(104857600),
  visibility: mediaVisibilitySchema,
  altText: z.string().max(1000).nullable().optional()
}).strict();

export const mediaUploadInputSchema = z.object({
  treeId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  mimeType: mediaMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(104857600),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  purpose: mediaPurposeSchema,
  visibility: mediaVisibilitySchema
}).strict();

export const mediaUploadIntentSchema = z.object({
  assetId: z.string().uuid(),
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime({ offset: true }),
  requiredHeaders: z.record(z.string(), z.string())
}).strict();
export const mediaDownloadSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime({ offset: true }),
  mode: z.literal("signed")
}).strict();
export const mediaLinkInputSchema = z.object({
  personId: z.string().uuid().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  contentRevisionId: z.string().uuid().nullable().optional(),
  placeId: z.string().uuid().nullable().optional(),
  caption: z.string().trim().min(1).max(1000).nullable().optional()
}).strict().superRefine((value, ctx) => {
  const targets = [value.personId, value.sourceId, value.contentRevisionId, value.placeId].filter(Boolean);
  if (targets.length !== 1) ctx.addIssue({ code: "custom", message: "Exactly one media link target is required" });
});
export const mediaLinkSchema = mediaLinkInputSchema.safeExtend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  assetId: z.string().uuid()
}).strict();
export const sourceKindSchema = z.enum(["book", "oral", "document", "photo", "website", "other"]);
export const sourceVisibilitySchema = z.enum(["public", "members", "restricted"]);
export const sourceSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  title: z.string().min(1).max(500),
  kind: sourceKindSchema,
  providerName: z.string().max(500).nullable().optional(),
  provenance: z.string().min(1).max(5000),
  recordedDate: genealogyDateSchema.nullable().optional(),
  originalAssetId: z.string().uuid().nullable().optional(),
  visibility: sourceVisibilitySchema,
  rightsNote: z.string().max(5000).nullable().optional()
}).strict();

export const sourceInputSchema = z.object({
  title: z.string().trim().min(1).max(500),
  kind: sourceKindSchema,
  providerName: z.string().trim().max(500).nullable().optional(),
  provenance: z.string().trim().min(1).max(5000),
  recordedDate: genealogyDateSchema.nullable().optional(),
  originalAssetId: z.string().uuid().nullable().optional(),
  visibility: sourceVisibilitySchema,
  rightsNote: z.string().trim().max(5000).nullable().optional()
}).strict();

export const citationConfidenceSchema = z.enum(["unverified", "supported", "verified", "disputed"]);
const citationTargetSchema = z.object({
  personId: z.string().uuid().nullable().optional(),
  factId: z.string().uuid().nullable().optional(),
  parentLinkId: z.string().uuid().nullable().optional(),
  unionId: z.string().uuid().nullable().optional()
}).strict();
export const citationInputSchema = citationTargetSchema.extend({
  sourceId: z.string().uuid(),
  locator: z.string().trim().min(1).max(1000),
  quotedText: z.string().max(5000).nullable().optional(),
  confidence: citationConfidenceSchema.nullable().optional()
}).superRefine((value, ctx) => {
  const targets = [value.personId, value.factId, value.parentLinkId, value.unionId].filter(Boolean);
  if (targets.length !== 1) ctx.addIssue({ code: "custom", message: "Exactly one citation target is required" });
});
export const citationSchema = citationInputSchema.safeExtend({
  id: z.string().uuid(),
  version: z.number().int().positive()
}).strict();
export const placeKindSchema = z.enum(["temple", "cemetery", "grave", "hometown", "other"]);
export const placeVisibilitySchema = z.enum(["public", "members", "restricted"]);

export const placeDirectionsInputSchema = z.object({
  placeId: z.string().uuid(),
  instructionText: z.string().trim().min(1).max(10_000),
  sourceId: z.string().uuid().nullable().optional(),
  visibility: placeVisibilitySchema,
}).strict();
export const placeDirectionsSchema = placeDirectionsInputSchema.safeExtend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  sourceId: z.string().uuid().nullable(),
}).strict();
export type PlaceDirectionsInput = z.infer<typeof placeDirectionsInputSchema>;
export type PlaceDirections = z.infer<typeof placeDirectionsSchema>;

const placeCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).strict();

export const placeInputSchema = z.object({
  name: z.string().trim().min(1).max(500),
  kind: placeKindSchema,
  addressText: z.string().trim().max(1_000).nullable().optional(),
  latitude: placeCoordinatesSchema.shape.latitude,
  longitude: placeCoordinatesSchema.shape.longitude,
  visibility: placeVisibilitySchema,
  coordinateVisibility: placeVisibilitySchema,
}).strict().superRefine((value, context) => {
  const hasLatitude = typeof value.latitude === "number";
  const hasLongitude = typeof value.longitude === "number";
  if (hasLatitude !== hasLongitude) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "latitude and longitude must be provided together" });
  }
});
export const placeSchema = placeInputSchema.safeExtend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
}).strict();

export const burialInputSchema = z.object({
  personId: z.string().uuid(),
  placeId: z.string().uuid(),
  locator: z.string().trim().max(500).nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  visibility: placeVisibilitySchema,
}).strict();

export const burialRecordSchema = burialInputSchema.safeExtend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
}).strict();

export type PlaceInput = z.infer<typeof placeInputSchema>;
export type PlaceRecord = z.infer<typeof placeSchema>;
export type BurialInput = z.infer<typeof burialInputSchema>;
export type BurialRecord = z.infer<typeof burialRecordSchema>;

export const externalMapProviderSchema = z.enum(["google_maps", "openstreetmap"]);
export const explicitExternalMapLinkRequestSchema = z.object({
  placeId: z.string().uuid(),
  provider: externalMapProviderSchema,
  confirmed: z.literal(true),
}).strict();
export type ExternalMapProvider = z.infer<typeof externalMapProviderSchema>;
export type ExplicitExternalMapLinkRequest = z.infer<typeof explicitExternalMapLinkRequestSchema>;
export const proposalDetailItemSchema = z.object({
  id: z.string().uuid(),
  targetKind: z.enum(["person", "fact", "parent_link", "union", "branch", "merge", "publication"]),
  targetId: z.string().uuid().nullable(),
  baseVersion: z.number().int().positive().nullable(),
  operation: z.enum(["create", "update", "delete", "merge", "publish"]),
  fieldChanges: z.record(z.string(), z.unknown()),
  sourceIds: z.array(z.string().uuid())
}).strict();

export const proposalDetailSchema = z.object({
  id: z.string().uuid(),
  trackingCode: z.string().regex(/^PGP-[A-Z0-9]{10}$/),
  treeId: z.string().uuid(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  status: z.enum(["draft", "submitted", "needs_info", "approved", "rejected", "withdrawn"]),
  kind: proposalKindSchema,
  reason: z.string().min(1),
  branchId: z.string().uuid().nullable(),
  submittedBy: z.string().uuid().nullable(),
  items: z.array(proposalDetailItemSchema).max(100)
}).strict();

export const proposalContextSchema = z.object({
  treeId: z.string().uuid(),
  treeName: z.string().min(1),
  branchId: z.string().uuid().nullable(),
  branchName: z.string().min(1).nullable()
}).strict();

export const proposalDiffItemSchema = z.object({
  itemId: z.string().uuid(),
  targetKind: z.enum(["person", "fact", "parent_link", "union", "branch", "merge", "publication"]),
  base: z.record(z.string(), z.unknown()).nullable(),
  current: z.record(z.string(), z.unknown()).nullable(),
  proposed: z.object({
    baseVersion: z.number().int().positive().nullable(),
    changes: z.record(z.string(), z.unknown())
  }).strict(),
  isStale: z.boolean()
}).strict();

export const proposalDiffSchema = z.object({
  proposalId: z.string().uuid(),
  items: z.array(proposalDiffItemSchema).max(100)
}).strict();

export const claimSubmitInputSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  reason: z.string().trim().min(1).max(4000)
});

export const claimReviewInputSchema = z.object({
  claimId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(1).max(4000),
  baseVersion: z.number().int().positive()
});

export const claimMutationResultSchema = z.object({
  id: z.string().uuid(),
  treeId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected"]),
  version: z.number().int().positive()
});

export const loginInputSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128)
});

export const authRecoveryInputSchema = z.object({
  email: z.string().trim().email().max(320)
}).strict();

export const authRecoveryResultSchema = z.object({
  accepted: z.literal(true)
}).strict();

export const passwordUpdateInputSchema = z.object({
  password: z.string().min(8).max(128)
}).strict();

export const passwordUpdateResultSchema = z.object({
  updated: z.literal(true)
}).strict();

export const idempotencyKeySchema = z.string().uuid();

export const mfaInputSchema = z.object({
  factorId: z.string().uuid(),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^[0-9]{6}$/)
}).strict();

export const mfaFactorInputSchema = z.object({
  factorId: z.string().uuid()
}).strict();

export const mfaChallengeResultSchema = z.object({
  challengeId: z.string().uuid(),
  expiresAt: z.number().int().positive()
}).strict();

export const mfaEnrollResultSchema = z.object({
  factorId: z.string().uuid(),
  qrCode: z.string().min(1).max(1000000),
  secret: z.string().min(1).max(512),
  uri: z.string().min(1).max(1000000)
}).strict();

export const mfaStatusSchema = z.object({
  authenticated: z.boolean(),
  aal: z.enum(["aal1", "aal2"]).nullable(),
  mfaEnrolled: z.boolean(),
  factorId: z.string().uuid().nullable()
}).strict();

export const membershipGrantSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  capability: z.enum(["treasury.write", "treasury.approve", "scholarship.review", "privacy.manage", "exports.bulk", "publication.manage", "operations.read"]),
  branchId: z.string().uuid().nullable(),
  expiresAt: z.string().min(1).max(64).nullable(),
  revokedAt: z.string().min(1).max(64).nullable()
}).strict();

export const membershipSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  displayName: z.string().min(1).max(500),
  role: z.enum(["owner", "admin", "reviewer", "editor", "member"]),
  status: z.enum(["pending", "active", "suspended", "revoked"]),
  personId: z.string().uuid().nullable(),
  mfaEnrolled: z.boolean(),
  grants: z.array(membershipGrantSchema).max(100)
}).strict();

export const memberInputSchema = z.object({
  role: z.enum(["admin", "reviewer", "editor", "member"]),
  status: z.enum(["active", "suspended", "revoked"]),
  reason: z.string().trim().min(5).max(2000)
}).strict();

export const grantInputSchema = z.object({
  capability: z.enum(["treasury.write", "treasury.approve", "scholarship.review", "privacy.manage", "exports.bulk", "publication.manage", "operations.read"]),
  branchId: z.string().uuid().nullable(),
  expiresAt: z.string().min(1).max(64).nullable()
}).strict();

export const commandResultSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.string().min(1).max(64)
}).strict();

export const invitationInputSchema = z.object({
  treeId: z.string().uuid(),
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "reviewer", "editor", "member"]),
  branchId: z.string().uuid().optional()
}).strict();

export const invitationAcceptInputSchema = z.object({
  token: z.string().trim().min(32).max(256)
}).strict();

export const invitationMutationResultSchema = z.object({
  id: z.string().uuid(),
  treeId: z.string().uuid(),
  status: z.enum(["queued", "pending", "revoked"]),
  version: z.number().int().positive()
}).strict();

export const apiMetaSchema = z.object({ requestId: z.string().min(1), version: z.number().int().positive().optional() });
export const errorResponseSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), fieldErrors: z.record(z.string(), z.array(z.string())).optional(), requestId: z.string(), retryable: z.boolean() }) });

export function assertValidGenealogyDate(value: unknown): asserts value is z.infer<typeof genealogyDateSchema> {
  genealogyDateSchema.parse(value);
}
const kinshipBooleanQuerySchema = z.enum(["true", "false"]).transform((value) => value === "true");
export const kinshipQuerySchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  includeAdoptive: kinshipBooleanQuerySchema.optional().transform((value) => value === undefined ? true : value)
});

const kinshipPathNodeSchema = z.object({
  person: personSummarySchema,
  via: z.enum(["start", "parent", "child", "partner", "adoptive_parent", "adoptive_child", "guardian_parent", "guardian_child", "step_parent", "step_child"])
});
export const kinshipSchema = z.object({
  status: z.enum(["found", "not_found_within_visible_graph", "limit_reached"]),
  paths: z.array(z.array(kinshipPathNodeSchema)),
  label: z.string().nullable(),
  labelConfidence: z.enum(["reviewed_rule", "descriptive_only", "unknown"]),
  visitedCount: z.number().int().nonnegative(),
  truncated: z.boolean()
});
export const graphDirectionSchema = z.enum(["ancestors", "descendants", "family", "roots"]);
export const graphQuerySchema = z.object({
  direction: graphDirectionSchema.default("family"),
  depth: z.coerce.number().int().min(1).max(6).default(3),
  maxNodes: z.coerce.number().int().min(1).max(300).default(120)
});
const graphEdgeSchema = z.object({
  id: z.string().min(1),
  sourceOccurrenceId: z.string().min(1),
  targetOccurrenceId: z.string().min(1),
  kind: z.enum(["biological", "adoptive", "guardian", "step", "union"]),
  status: z.enum(["confirmed", "disputed"]).optional()
});
const graphExpansionSchema = z.object({
  direction: graphDirectionSchema,
  depth: z.number().int().min(1).max(6),
  maxNodes: z.number().int().min(1).max(300),
  anchorOccurrenceId: z.string().min(1).nullable()
});
export const graphProjectionSchema = z.object({
  nodes: z.array(z.object({
    occurrenceId: z.string().min(1),
    person: personSummarySchema,
    depth: z.number().int().nonnegative(),
    generation: z.number().int().nullable()
  })),
  edges: z.array(graphEdgeSchema),
  roots: z.array(z.string().min(1)),
  graphRevision: z.number().int().positive(),
  truncated: z.boolean(),
  reason: z.enum(["node_limit", "depth_limit", "time_budget"]).nullable(),
  nextExpansion: graphExpansionSchema.nullable().default(null),
  expandablePersonIds: z.array(z.string().uuid())
});

export const rsvpResponseSchema = z.enum(["yes", "no", "maybe"]);
export const rsvpInputSchema = z.object({
  response: rsvpResponseSchema,
  headcount: z.number().int().min(0).max(20),
  note: z.string().trim().max(2000).default("")
}).strict();
export const rsvpMutationInputSchema = z.object({
  occurrenceId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  baseVersion: z.number().int().positive().nullable().default(null),
  response: rsvpResponseSchema,
  headcount: z.number().int().min(0).max(20),
  note: z.string().trim().max(2000).default("")
}).strict();
export const rsvpRecordSchema = z.object({
  id: z.string().min(1),
  occurrenceId: z.string().min(1),
  membershipId: z.string().min(1),
  version: z.number().int().positive(),
  response: rsvpResponseSchema,
  headcount: z.number().int().min(0).max(20),
  note: z.string().max(2000),
  idempotencyKey: z.string().min(1)
}).strict();
export const icsExportInputSchema = z.object({
  occurrenceIds: z.array(z.string().min(1)).min(1).max(500),
  scope: z.enum(["self", "members"]),
  generatedAt: z.string().regex(/^\d{8}T\d{6}Z$/)
}).strict();


export const deliveryAttemptSchema = z.object({
  id: z.string().min(1),
  notificationId: z.string().min(1),
  channel: z.enum(["email", "in_app"]),
  status: z.enum(["queued", "accepted", "sent", "failed", "suppressed"]),
  providerMessageId: z.string().min(1).nullable(),
  idempotencyKey: z.string().min(1).max(500),
  attemptCount: z.number().int().min(0).max(20)
}).superRefine((value, context) => {
  if ((value.status === "accepted" || value.status === "sent") && value.providerMessageId === null) {
    context.addIssue({
      code: "custom",
      path: ["providerMessageId"],
      message: "provider message id is required after acceptance",
    });
  }
}).strict();


export const notificationPreferenceSchema = z.object({
  channel: z.enum(["email", "in_app"]),
  eventKind: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(false),
  quietStartHour: z.number().int().min(0).max(23).default(22),
  quietEndHour: z.number().int().min(0).max(23).default(7),
  unsubscribed: z.boolean().default(false),
  suppressed: z.boolean().default(false),
}).strict();

export const notificationSendContextSchema = z.object({
  currentLocalHour: z.number().int().min(0).max(23),
  consentAllowed: z.boolean(),
}).strict();


export const jobStatusSchema = z.enum(["queued", "processed", "succeeded", "failed", "skipped"]);
export const jobCountersSchema = z.object({
  queued: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
}).strict();


const safeRichTextHref = (value: string): boolean => {
  if (/[^\P{Cc}\t\n\r]/u.test(value)) return false;
  if (value === "/" || (value.startsWith("/") && !value.startsWith("//"))) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === "";
  } catch {
    return false;
  }
};

export const richTextInlineSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().min(1).max(10_000),
  }).strict(),
  z.object({
    type: z.literal("strong"),
    text: z.string().min(1).max(10_000),
  }).strict(),
  z.object({
    type: z.literal("emphasis"),
    text: z.string().min(1).max(10_000),
  }).strict(),
  z.object({
    type: z.literal("link"),
    href: z.string().trim().min(1).max(2_048).refine(safeRichTextHref, "unsafe rich text link"),
    label: z.string().min(1).max(10_000),
  }).strict(),
]);

const richTextListItemSchema = z.object({
  type: z.literal("list_item"),
  children: z.array(richTextInlineSchema).min(1).max(100),
}).strict();

export const richTextBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    children: z.array(richTextInlineSchema).max(100),
  }).strict(),
  z.object({
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]),
    children: z.array(richTextInlineSchema).min(1).max(100),
  }).strict(),
  z.object({
    type: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(richTextListItemSchema).min(1).max(50),
  }).strict(),
  z.object({
    type: z.literal("quote"),
    children: z.array(richTextInlineSchema).min(1).max(100),
  }).strict(),
  z.object({
    type: z.literal("divider"),
  }).strict(),
  z.object({
    type: z.literal("image"),
    assetId: z.string().uuid(),
    alt: z.string().min(1).max(300),
    caption: z.string().max(1_000).optional(),
  }).strict(),
]);

export const richTextDocumentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(richTextBlockSchema).max(200),
}).strict();

export const contentRevisionInputSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body: richTextDocumentSchema,
}).strict();

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>;
export type RichTextBlock = z.infer<typeof richTextBlockSchema>;
export type RichTextInline = z.infer<typeof richTextInlineSchema>;


export const contentRevisionStatusSchema = z.enum(["draft", "submitted", "approved", "published", "archived"]);
export const contentLifecycleStatusSchema = z.enum(["draft", "submitted", "approved", "scheduled", "published", "archived"]);

export const contentRevisionTransitionSchema = z.object({
  action: z.enum(["submit", "approve", "publish", "archive"]),
  revisionId: z.string().uuid(),
  actorId: z.string().uuid(),
  expectedRevisionVersion: z.number().int().positive(),
  expectedPageVersion: z.number().int().positive().nullable().default(null),
  publishAt: z.string().datetime({ offset: true }).nullable().default(null),
}).strict();

export const previewGrantSchema = z.object({
  token: z.string().min(32).max(256),
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  noIndex: z.literal(true),
}).strict();

export const previewAccessSchema = z.object({
  token: z.string().min(32).max(256),
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
}).strict();

export type ContentRevisionStatus = z.infer<typeof contentRevisionStatusSchema>;
export type ContentLifecycleStatus = z.infer<typeof contentLifecycleStatusSchema>;
export type ContentRevisionTransition = z.infer<typeof contentRevisionTransitionSchema>;
export type PreviewGrant = z.infer<typeof previewGrantSchema>;


export const publicContentKindSchema = z.enum(["history", "news", "guide", "policy"]);
export const publicContentSeoInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  kind: publicContentKindSchema,
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(320),
  visibility: z.literal("public"),
  publishedRevisionId: z.string().uuid(),
  revisionId: z.string().uuid(),
  revisionStatus: z.literal("published"),
  updatedAt: z.string().datetime({ offset: true }),
  cover: z.object({
    url: z.string().url(),
    alt: z.string().trim().min(1).max(300),
  }).strict().nullable(),
}).strict().superRefine((value, context) => {
  if (value.publishedRevisionId !== value.revisionId) {
    context.addIssue({ code: "custom", path: ["revisionId"], message: "public projection must point to published revision" });
  }
});

export type PublicContentSeoInput = z.infer<typeof publicContentSeoInputSchema>;
