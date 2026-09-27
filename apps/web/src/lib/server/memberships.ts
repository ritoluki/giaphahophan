import { membershipSchema } from "@phan/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableText(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

export function parseMembershipRow(value: unknown) {
  if (!isRecord(value)) throw new Error("Membership projection was not an object");
  const grantRows = Array.isArray(value.grants) ? value.grants : [];
  const grants = grantRows.map((grant) => {
    if (!isRecord(grant)) throw new Error("Grant projection was not an object");
    return {
      id: grant.id,
      version: grant.version,
      capability: grant.capability,
      branchId: grant.branchId ?? grant.branch_id ?? null,
      expiresAt: nullableText(grant.expiresAt ?? grant.expires_at),
      revokedAt: nullableText(grant.revokedAt ?? grant.revoked_at)
    };
  });
  return membershipSchema.parse({
    id: value.id,
    version: value.version,
    displayName: value.display_name ?? value.displayName,
    role: value.role,
    status: value.status,
    personId: value.person_id ?? value.personId ?? null,
    mfaEnrolled: value.mfa_enrolled ?? value.mfaEnrolled,
    grants
  });
}

export function parseCommandRow(value: unknown) {
  if (!isRecord(value)) throw new Error("Command response was not an object");
  return {
    id: value.id,
    version: value.version,
    status: value.status
  };
}