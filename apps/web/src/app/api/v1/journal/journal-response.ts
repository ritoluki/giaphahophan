import { journalSchema } from "@phan/contracts";

export function parseJournalRpcResponse(data: unknown) {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as Record<string, unknown>;
  return journalSchema.parse({
    id: row.id,
    version: row.version,
    code: row.code,
    status: row.status,
    fundId: row.fund_id,
    entryDate: row.entry_date,
    description: row.description,
    lines: row.lines,
    proofAssetId: row.proof_asset_id ?? null,
    donorPersonId: row.donor_person_id ?? null
  });
}