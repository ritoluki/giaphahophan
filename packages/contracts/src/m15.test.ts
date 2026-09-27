import { describe, expect, it } from "vitest";
import { scholarshipApplicationSchema, scholarshipProgramInputSchema, scholarshipPublicationSchema, scholarshipSafeguardInputSchema, scholarshipStorySchema } from "./index";

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

  it("requires an explicit guardian state before a story can be published", () => {
    const safeguard = scholarshipSafeguardInputSchema.parse({ minorStatus: "minor", guardianStatus: "verified", guardianProofAssetId: "a5100000-0000-4000-8000-000000000003", reason: "Đã kiểm tra minh chứng người đại diện.", baseVersion: 1 });
    expect(safeguard.guardianStatus).toBe("verified");
    const publication = scholarshipPublicationSchema.parse({ id: "a5100000-0000-4000-8000-000000000010", version: 1, applicationId: "a5100000-0000-4000-8000-000000000001", title: "Câu chuyện minh họa", story: "Nội dung đã được duyệt.", sourceAssetId: "a5100000-0000-4000-8000-000000000003", status: "submitted", publishedAt: null });
    expect(publication.status).toBe("submitted");
    expect(scholarshipStorySchema.safeParse({ ...publication, applicationId: undefined, sourceAssetId: undefined, status: "approved", publishedAt: "2026-09-28T00:00:00.000Z" }).success).toBe(false);
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