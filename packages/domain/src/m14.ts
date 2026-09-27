import {
  balancedJournalInputSchema,
  journalInputSchema,
  type JournalInput,
  type JournalLineInput,
} from "@phan/contracts";

export type JournalBalance = {
  readonly totalVnd: string;
  readonly lineCount: number;
  readonly balanced: boolean;
};

export function sumJournalVnd(lines: readonly Pick<JournalLineInput, "signedAmountVnd">[]): string | null {
  try {
    return lines.reduce((total, line) => total + BigInt(line.signedAmountVnd), 0n).toString();
  } catch {
    return null;
  }
}

export function inspectJournalBalance(lines: readonly Pick<JournalLineInput, "signedAmountVnd">[]): JournalBalance {
  const totalVnd = sumJournalVnd(lines);
  return {
    totalVnd: totalVnd ?? "invalid",
    lineCount: lines.length,
    balanced: totalVnd === "0" && lines.length >= 2,
  };
}

export function parseJournalInput(input: unknown): JournalInput | null {
  const result = journalInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function validateJournalForPosting(input: unknown): JournalInput | null {
  const result = balancedJournalInputSchema.safeParse(input);
  return result.success ? result.data : null;
}