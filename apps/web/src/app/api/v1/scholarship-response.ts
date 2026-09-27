import { scholarshipApplicationSchema, scholarshipProgramSchema, scholarshipPublicationSchema, scholarshipSafeguardSchema, scholarshipStorySchema } from "@phan/contracts";

function objectRow(data: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(data) ? data[0] : data;
  return candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : null;
}

export function parseScholarshipProgramRpcResponse(data: unknown) {
  const row = objectRow(data);
  if (!row) return null;
  return scholarshipProgramSchema.parse({ id: row.id, version: row.version, fundId: row.fund_id, title: row.title, criteria: row.criteria, closesAt: row.closes_at, status: row.status });
}

export function parseScholarshipApplicationRpcResponse(data: unknown) {
  const row = objectRow(data);
  if (!row) return null;
  return scholarshipApplicationSchema.parse({ id: row.id, version: row.version, programId: row.program_id, personId: row.person_id, status: row.status, statement: row.statement, evidenceAssetId: row.evidence_asset_id });
}
export function parseScholarshipSafeguardRpcResponse(data: unknown) {
  const row = objectRow(data);
  if (!row) return null;
  return scholarshipSafeguardSchema.parse({ applicationId: row.application_id, version: row.version, minorStatus: row.minor_status, guardianStatus: row.guardian_status, guardianProofAssetId: row.guardian_proof_asset_id, verifiedAt: row.guardian_verified_at });
}

export function parseScholarshipPublicationRpcResponse(data: unknown) {
  const row = objectRow(data);
  if (!row) return null;
  return scholarshipPublicationSchema.parse({ id: row.id, version: row.version, applicationId: row.application_id, title: row.title, story: row.story, sourceAssetId: row.source_asset_id, status: row.status, publishedAt: row.published_at });
}

export function parseScholarshipStoryRpcResponse(data: unknown) {
  const row = objectRow(data);
  if (!row) return null;
  return scholarshipStorySchema.parse({ id: row.id, version: row.version, title: row.title, story: row.story, publishedAt: row.published_at });
}