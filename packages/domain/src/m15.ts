import {
  scholarshipApplicationInputSchema,
  scholarshipApplicationStatusSchema,
  scholarshipProgramInputSchema,
  type ScholarshipApplicationInput,
  type ScholarshipApplicationRecord,
  type ScholarshipProgramInput,
} from "@phan/contracts";

export function parseScholarshipProgramInput(input: unknown): ScholarshipProgramInput | null {
  const result = scholarshipProgramInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function parseScholarshipApplicationInput(input: unknown): ScholarshipApplicationInput | null {
  const result = scholarshipApplicationInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function canTransitionScholarshipApplication(
  from: ScholarshipApplicationRecord["status"],
  to: ScholarshipApplicationRecord["status"],
): boolean {
  if (!scholarshipApplicationStatusSchema.safeParse(from).success || !scholarshipApplicationStatusSchema.safeParse(to).success) {
    return false;
  }
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