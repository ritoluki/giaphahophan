import { describe, expect, it } from "vitest";
import { isAllowedMutationOrigin } from "./mutation-origin";

describe("private mutation configured origin", () => {
  it("accepts the configured public loopback rather than Next's internal hostname", () => {
    expect(isAllowedMutationOrigin("http://127.0.0.1:3100", "http://127.0.0.1:3100")).toBe(true);
  });
  it.each([null, "null", "http://localhost:3100", "http://127.0.0.1:3101", "https://evil.example", "http://127.0.0.1:3100.evil.example"])("rejects unconfigured origins", origin => {
    expect(isAllowedMutationOrigin(origin, "http://127.0.0.1:3100")).toBe(false);
  });
  it.each([undefined, "broken", "file:///tmp", "https://user:password@example.test"])("fails closed for invalid deployment config", appUrl => {
    expect(isAllowedMutationOrigin("https://example.test", appUrl)).toBe(false);
  });
});
