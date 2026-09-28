import {
  scholarshipApplicationInputSchema,
  scholarshipApplicationStatusSchema,
  scholarshipProgramInputSchema,
  scholarshipPublicationInputSchema,
  scholarshipPublicationStatusSchema,
  scholarshipSafeguardInputSchema,
  reportRangeSchema,
  scholarshipReportSchema,
  type ScholarshipApplicationInput,
  type ScholarshipApplicationRecord,
  type ScholarshipProgramInput,
  type ScholarshipPublicationInput,
  type ScholarshipSafeguardInput,
  type ScholarshipReportRecord,
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
export type ScholarshipReportAwardInput = {
  applicationId: string;
  amountVnd: string;
  status: "approved" | "paid" | "reversed" | "withdrawn";
  approvedOn: string;
  paidOn: string | null;
  reversedOn: string | null;
};

function inRange(value: string | null, from: string, to: string) {
  return value !== null && value >= from && value <= to;
}

export function buildScholarshipReport(input: {
  fundId: string;
  from: string;
  to: string;
  awards: readonly ScholarshipReportAwardInput[];
  applicantsCount: number | null;
  donorsCount: number | null;
}): ScholarshipReportRecord | null {
  const range = reportRangeSchema.safeParse({ from: input.from, to: input.to });
  if (!range.success || !/^[0-9a-f-]{36}$/i.test(input.fundId)) return null;
  if (input.applicantsCount !== null && (!Number.isInteger(input.applicantsCount) || input.applicantsCount < 0)) return null;
  if (input.donorsCount !== null && (!Number.isInteger(input.donorsCount) || input.donorsCount < 0)) return null;

  let awardsCount = 0;
  let approved = 0n;
  let paid = 0n;
  let reversed = 0n;
  for (const award of input.awards) {
    if (!/^[0-9a-f-]{36}$/i.test(award.applicationId)) return null;
    const amount = scholarshipReportSchema.shape.approvedAmountVnd.safeParse(award.amountVnd);
    if (!amount.success || !inRange(award.approvedOn, input.from, input.to)) continue;
    if (award.status !== "withdrawn") {
      awardsCount += 1;
      approved += BigInt(award.amountVnd);
    }
    if (award.status === "paid" || award.status === "reversed") {
      if (inRange(award.paidOn, input.from, input.to)) paid += BigInt(award.amountVnd);
    }
    if (award.status === "reversed" && inRange(award.reversedOn, input.from, input.to)) reversed += BigInt(award.amountVnd);
  }

  return scholarshipReportSchema.parse({
    fundId: input.fundId,
    from: input.from,
    to: input.to,
    awardsCount,
    applicantsCount: input.applicantsCount,
    donorsCount: input.donorsCount,
    approvedAmountVnd: approved.toString(),
    paidAmountVnd: paid.toString(),
    reversedAmountVnd: reversed.toString(),
    netPaidAmountVnd: (paid - reversed).toString(),
  });
}