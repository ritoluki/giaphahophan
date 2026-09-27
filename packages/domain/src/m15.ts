import {
  scholarshipApplicationInputSchema,
  scholarshipApplicationStatusSchema,
  scholarshipProgramInputSchema,
  scholarshipPublicationInputSchema,
  scholarshipPublicationStatusSchema,
  scholarshipSafeguardInputSchema,
  type ScholarshipApplicationInput,
  type ScholarshipApplicationRecord,
  type ScholarshipProgramInput,
  type ScholarshipPublicationInput,
  type ScholarshipSafeguardInput,
} from "@phan/contracts";

export function parseScholarshipProgramInput(input: unknown): ScholarshipProgramInput | null {
  const result = scholarshipProgramInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function parseScholarshipApplicationInput(input: unknown): ScholarshipApplicationInput | null {
  const result = scholarshipApplicationInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function parseScholarshipSafeguardInput(input: unknown): ScholarshipSafeguardInput | null {
  const result = scholarshipSafeguardInputSchema.safeParse(input);
  if (!result.success) return null;
  if (result.data.minorStatus === "minor" && result.data.guardianStatus !== "verified") return null;
  if (result.data.minorStatus === "adult" && result.data.guardianStatus !== "not_required") return null;
  if (result.data.minorStatus !== "minor" && result.data.guardianProofAssetId !== null) return null;
  return result.data;
}

export function parseScholarshipPublicationInput(input: unknown): ScholarshipPublicationInput | null {
  const result = scholarshipPublicationInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function canTransitionScholarshipPublication(
  from: "draft" | "submitted" | "needs_info" | "approved" | "rejected" | "withdrawn",
  to: "draft" | "submitted" | "needs_info" | "approved" | "rejected" | "withdrawn",
): boolean {
  if (!scholarshipPublicationStatusSchema.safeParse(from).success || !scholarshipPublicationStatusSchema.safeParse(to).success) return false;
  const transitions: Record<typeof from, readonly typeof to[]> = {
    draft: ["submitted", "withdrawn"],
    submitted: ["needs_info", "approved", "rejected", "withdrawn"],
    needs_info: ["submitted", "withdrawn"],
    approved: [],
    rejected: [],
    withdrawn: [],
  };
  return transitions[from].includes(to);
}

export function canTransitionScholarshipApplication(
  from: ScholarshipApplicationRecord["status"],
  to: ScholarshipApplicationRecord["status"],
): boolean {
  if (!scholarshipApplicationStatusSchema.safeParse(from).success || !scholarshipApplicationStatusSchema.safeParse(to).success) return false;
  const transitions: Record<ScholarshipApplicationRecord["status"], readonly ScholarshipApplicationRecord["status"][]> = {
    draft: ["submitted", "withdrawn"],
    submitted: ["needs_info", "approved", "rejected", "withdrawn"],
    needs_info: ["submitted", "withdrawn"],
    approved: ["awarded", "withdrawn"],
    rejected: [],
    withdrawn: [],
    awarded: [],
  };
  return transitions[from].includes(to);
}