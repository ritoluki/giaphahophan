import { scholarshipApplicationSchema, scholarshipProgramSchema } from "@phan/contracts";

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