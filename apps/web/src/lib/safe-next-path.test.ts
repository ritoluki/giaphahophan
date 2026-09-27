import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("keeps only same-origin allowlisted destinations", () => {
    expect(safeNextPath("/quen-mat-khau?mode=reset")).toBe("/quen-mat-khau?mode=reset");
    expect(safeNextPath("/loi-moi/synthetic-token")).toBe("/loi-moi/synthetic-token");
    expect(safeNextPath("https://evil.example")).toBe("/gia-pha");
    expect(safeNextPath("//evil.example/path")).toBe("/gia-pha");
    expect(safeNextPath("/admin/secret")).toBe("/gia-pha");
  });
});