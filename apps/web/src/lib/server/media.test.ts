import { describe, expect, it } from "vitest";
import { hasAllowedMagic } from "./media";

describe("private structured media uploads", () => {
  it("accepts strict UTF-8 JSON/CSV bytes and rejects binary or invalid UTF-8", () => {
    expect(hasAllowedMagic(new TextEncoder().encode('{"schemaVersion":"1"}'), "application/json")).toBe(true);
    expect(hasAllowedMagic(new TextEncoder().encode("name,date\nDemo,unknown"), "text/csv")).toBe(true);
    expect(hasAllowedMagic(new Uint8Array([0xff, 0xfe]), "application/json")).toBe(false);
    expect(hasAllowedMagic(new TextEncoder().encode("bad\u0000data"), "text/csv")).toBe(false);
  });
});
