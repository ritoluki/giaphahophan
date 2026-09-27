import { describe, expect, it } from "vitest";

import { deliveryAttemptSchema } from "./index";

describe("M11-02 delivery contracts", () => {
  it("accepts a provider acceptance record without raw payload", () => {
    expect(deliveryAttemptSchema.parse({
      id: "attempt-1",
      notificationId: "notification-1",
      channel: "email",
      status: "accepted",
      providerMessageId: "provider-1",
      idempotencyKey: "event:1:member:email:7",
      attemptCount: 1,
    }).providerMessageId).toBe("provider-1");
  });

  it("rejects a missing provider ID for an accepted attempt", () => {
    expect(() => deliveryAttemptSchema.parse({
      id: "attempt-1",
      notificationId: "notification-1",
      channel: "email",
      status: "accepted",
      providerMessageId: null,
      idempotencyKey: "event:1:member:email:7",
      attemptCount: 1,
    })).toThrow();
  });
});
