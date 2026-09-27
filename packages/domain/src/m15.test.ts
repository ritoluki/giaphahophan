import { describe, expect, it } from "vitest";
import { canTransitionScholarshipApplication, canTransitionScholarshipPublication, parseScholarshipApplicationInput, parseScholarshipProgramInput, parseScholarshipPublicationInput, parseScholarshipSafeguardInput } from "./m15";

const program = {
  fundId: "a5100000-0000-4000-8000-000000000001",
  title: "Học bổng hiếu học 2026",
  criteria: "Dành cho thành viên có thành tích học tập tốt.",
  closesAt: "2026-12-31T16:59:59.000Z",
  status: "open" as const,
};

describe("M15 scholarship domain", () => {
  it("parses the public program input without accepting unknown fields", () => {
    expect(parseScholarshipProgramInput(program)).toEqual(program);
    expect(parseScholarshipProgramInput({ ...program, secret: "nope" })).toBeNull();
    expect(parseScholarshipProgramInput({ ...program, closesAt: "tomorrow" })).toBeNull();
  });

  it("parses an application with a private evidence reference", () => {
    const application = { personId: "a5100000-0000-4000-8000-000000000002", statement: "Em xin ứng tuyển học bổng.", evidenceAssetId: "a5100000-0000-4000-8000-000000000003" };
    expect(parseScholarshipApplicationInput(application)).toEqual(application);
    expect(parseScholarshipApplicationInput({ ...application, evidenceAssetId: "not-a-uuid" })).toBeNull();
  });

  it("fails closed when a minor has no verified guardian evidence", () => {
    expect(parseScholarshipSafeguardInput({ minorStatus: "minor", guardianStatus: "pending", guardianProofAssetId: null, reason: "Chưa đủ hồ sơ.", baseVersion: 1 })).toBeNull();
    expect(parseScholarshipSafeguardInput({ minorStatus: "adult", guardianStatus: "not_required", guardianProofAssetId: null, reason: "Đã kiểm tra.", baseVersion: 1 })).not.toBeNull();
    expect(parseScholarshipPublicationInput({ applicationId: "a5100000-0000-4000-8000-000000000001", title: "Câu chuyện", story: "Nội dung", sourceAssetId: "a5100000-0000-4000-8000-000000000003" })).not.toBeNull();
  });

  it("keeps publication approval independent from application approval", () => {
    expect(canTransitionScholarshipPublication("submitted", "approved")).toBe(true);
    expect(canTransitionScholarshipPublication("approved", "withdrawn")).toBe(false);
  });

  it("allows only explicit application workflow transitions", () => {
    expect(canTransitionScholarshipApplication("draft", "submitted")).toBe(true);
    expect(canTransitionScholarshipApplication("submitted", "needs_info")).toBe(true);
    expect(canTransitionScholarshipApplication("needs_info", "submitted")).toBe(true);
    expect(canTransitionScholarshipApplication("approved", "awarded")).toBe(true);
    expect(canTransitionScholarshipApplication("rejected", "approved")).toBe(false);
    expect(canTransitionScholarshipApplication("awarded", "withdrawn")).toBe(false);
  });
});