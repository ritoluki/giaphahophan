import { citationSchema, sourceSchema } from "@phan/contracts";

export function parseSourceRow(row: unknown) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Source response was not an object");
  const value = row as Record<string, unknown>;
  return sourceSchema.parse({
    id: value.id,
    version: value.version,
    title: value.title,
    kind: value.kind,
    providerName: value.provider_name ?? value.providerName ?? null,
    provenance: value.provenance,
    recordedDate: value.recorded_date ?? value.recordedDate ?? null,
    originalAssetId: value.original_asset_id ?? value.originalAssetId ?? null,
    visibility: value.visibility,
    rightsNote: value.rights_note ?? value.rightsNote ?? null
  });
}

export function parseCitationRow(row: unknown) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Citation response was not an object");
  const value = row as Record<string, unknown>;
  return citationSchema.parse({
    id: value.id,
    version: value.version,
    sourceId: value.source_id ?? value.sourceId,
    personId: value.person_id ?? value.personId ?? null,
    factId: value.fact_id ?? value.factId ?? null,
    parentLinkId: value.parent_link_id ?? value.parentLinkId ?? null,
    unionId: value.union_id ?? value.unionId ?? null,
    locator: value.locator,
    quotedText: value.quoted_text ?? value.quotedText ?? null,
    confidence: value.confidence ?? null
  });
}
