import { describe, expect, it } from "vitest";
import { hasAllowedMagic } from "./media";

describe("private structured media uploads", () => {
  it("accepts strict UTF-8 JSON/CSV bytes and rejects binary or invalid UTF-8", () => {
    expect(hasAllowedMagic(new TextEncoder().encode('{"schemaVersion":"1"}'), "application/json")).toBe(true);
    expect(hasAllowedMagic(new TextEncoder().encode("name,date\nDemo,unknown"), "text/csv")).toBe(true);
    expect(hasAllowedMagic(new Uint8Array([0xff, 0xfe]), "application/json")).toBe(false);
    expect(hasAllowedMagic(new TextEncoder().encode("bad\u0000data"), "text/csv")).toBe(false);
    expect(hasAllowedMagic(new TextEncoder().encode("0 HEAD\n1 GEDC\n2 VERS 7.0\n0 TRLR\n"), "text/plain")).toBe(true);
    expect(hasAllowedMagic(new TextEncoder().encode("plain user text"), "text/plain")).toBe(false);
  });
});
