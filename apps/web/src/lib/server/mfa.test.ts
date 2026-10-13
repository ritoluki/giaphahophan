import { describe, expect, it } from "vitest";
import { appTotpFriendlyName, pendingAppTotpFactorIds } from "./mfa";

describe("pending application TOTP replacement", () => {
  it("selects only unverified TOTP for this application's enrollment", () => {
    expect(pendingAppTotpFactorIds([
      { id: "pending-app", factor_type: "totp", status: "unverified", friendly_name: appTotpFriendlyName },
      { id: "verified-app", factor_type: "totp", status: "verified", friendly_name: appTotpFriendlyName },
      { id: "other-app", factor_type: "totp", status: "unverified", friendly_name: "Other authenticator" },
      { id: "phone", factor_type: "phone", status: "unverified", friendly_name: appTotpFriendlyName },
    ])).toEqual(["pending-app"]);
  });
});
