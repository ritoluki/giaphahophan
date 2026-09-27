import { describe, expect, it } from "vitest";
import { kinshipQuerySchema, kinshipSchema } from "./index";

describe("M05 kinship contracts", () => {
  it("parses bounded query flags without treating false as true", () => {
    expect(kinshipQuerySchema.parse({ from: "00000000-0000-4000-8000-000000000001", to: "00000000-0000-4000-8000-000000000002", includeAdoptive: "false" }).includeAdoptive).toBe(false);
  });

  it("validates a redacted path result", () => {
    const result = kinshipSchema.parse({ status: "not_found_within_visible_graph", paths: [], label: null, labelConfidence: "unknown", visitedCount: 2, truncated: false });
    expect(result.status).toBe("not_found_within_visible_graph");
  });
});