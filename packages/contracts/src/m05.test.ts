import { describe, expect, it } from "vitest";
import { kinshipQuerySchema, kinshipSchema } from "./index";

describe("M05 kinship contracts", () => {
  it("parses bounded query flags without treating false as true", () => {
    expect(kinshipQuerySchema.parse({ from: "00000000-0000-4000-8000-000000000001", to: "00000000-0000-4000-8000-000000000002", includeAdoptive: "false" }).includeAdoptive).toBe(false);
  });

  it("accepts explicit guardian and step path semantics", () => {
    const person = (id: string, code: string) => ({ id, version: 1, code, displayName: code, lifeStatus: "unknown" as const, primaryBranchId: null, isDemo: true });
    const result = kinshipSchema.parse({ status: "found", paths: [[{ person: person("00000000-0000-4000-8000-000000000001", "A"), via: "start" }, { person: person("00000000-0000-4000-8000-000000000002", "B"), via: "guardian_child" }, { person: person("00000000-0000-4000-8000-000000000003", "C"), via: "step_child" }]], label: null, labelConfidence: "descriptive_only", visitedCount: 3, truncated: false });
    expect(result.paths[0]?.map((node) => node.via)).toEqual(["start", "guardian_child", "step_child"]);
  });

  it("validates a redacted path result", () => {
    const result = kinshipSchema.parse({ status: "not_found_within_visible_graph", paths: [], label: null, labelConfidence: "unknown", visitedCount: 2, truncated: false });
    expect(result.status).toBe("not_found_within_visible_graph");
  });
});