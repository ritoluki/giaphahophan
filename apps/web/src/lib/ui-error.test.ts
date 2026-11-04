import { describe, expect, it } from "vitest";
import { getUiErrorMessage } from "./ui-error";

describe("Vietnamese public error presentation", () => {
  it("uses known error codes without exposing the server message", () => {
    expect(getUiErrorMessage({ code: "MFA_REQUIRED", message: "secret diagnostic" })).toBe("Xác thực hai bước để tiếp tục.");
    expect(getUiErrorMessage({ code: "VERSION_CONFLICT" })).toContain("Thông tin đã thay đổi");
    expect(getUiErrorMessage({ error: { code: "MFA_REQUIRED", message: "private" } })).toBe("Xác thực hai bước để tiếp tục.");
    expect(getUiErrorMessage({ data: { code: "AUTH_REQUIRED" } })).toBe("Đăng nhập để tiếp tục.");
  });
  it("keeps hidden identities and unknown diagnostics out of the page", () => {
    for (const value of [null, "internal UUID", new Error("private"), { code: "UNKNOWN", message: "person-private-marker" }]) {
      expect(getUiErrorMessage(value, "Chưa tải được thông tin.")).toBe("Chưa tải được thông tin.");
    }
  });
  it("treats object prototype names as unknown error codes", () => {
    for (const code of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(getUiErrorMessage({ error: { code } }, "Chưa tải được thông tin.")).toBe("Chưa tải được thông tin.");
    }
  });
});
