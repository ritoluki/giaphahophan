import { describe, expect, it } from "vitest";
import { scholarshipApplicationSchema, scholarshipProgramInputSchema } from "./index";

describe("M15 scholarship contracts", () => {
  it("accepts a public program and keeps the status vocabulary bounded", () => {
    const input = {
      fundId: "a5100000-0000-4000-8000-000000000001",
      title: "Học bổng minh họa",
      criteria: "Tiêu chí minh họa.",
      closesAt: null,
      status: "open" as const,
    };
    const result = scholarshipProgramInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(scholarshipProgramInputSchema.safeParse({ ...input, status: "published" }).success).toBe(false);
  });

  it("requires a restricted evidence asset reference and supports needs_info/withdrawn", () => {
    const base = {
      id: "a5100000-0000-4000-8000-000000000010",
      version: 1,
      programId: "a5100000-0000-4000-8000-000000000001",
      personId: "a5100000-0000-4000-8000-000000000002",
      statement: "Bài trình bày minh họa.",
      evidenceAssetId: "a5100000-0000-4000-8000-000000000003",
    };
    expect(scholarshipApplicationSchema.parse({ ...base, status: "needs_info" }).status).toBe("needs_info");
    expect(scholarshipApplicationSchema.parse({ ...base, status: "withdrawn" }).status).toBe("withdrawn");
    expect(scholarshipApplicationSchema.safeParse({ ...base, status: "approved", evidenceAssetId: "not-uuid" }).success).toBe(false);
  });
});