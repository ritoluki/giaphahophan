import { describe, expect, it } from "vitest";

import {
  DeliveryProviderError,
  type DeliveryAttempt,
  type DeliveryAttemptStore,
  type DeliveryMessage,
  type DeliveryProvider,
  type ProviderMessage,
  deliverIdempotently,
} from "./delivery";

const attempt = (overrides: Partial<DeliveryAttempt> = {}): DeliveryAttempt => ({
  id: "attempt-1",
  notificationId: "notification-1",
  channel: "email",
  idempotencyKey: "event:occurrence-1:member-1:email:7",
  status: "queued",
  providerMessageId: null,
  attemptCount: 0,
  ...overrides,
});

const message: DeliveryMessage = {
  notificationId: "notification-1",
  channel: "email",
  idempotencyKey: "event:occurrence-1:member-1:email:7",
  templateCode: "event.reminder",
};

class FakeProvider implements DeliveryProvider {
  readonly sent: DeliveryMessage[] = [];
  readonly receipts = new Map<string, ProviderMessage>();

  async reconcile(key: string): Promise<ProviderMessage | null> {
    return this.receipts.get(key) ?? null;
  }

  async send(input: DeliveryMessage): Promise<ProviderMessage> {
    this.sent.push(input);
    const receipt = { providerMessageId: "provider-1", acceptedAt: "2026-09-28T08:00:00Z" };
    this.receipts.set(input.idempotencyKey, receipt);
    return receipt;
  }
}

class FakeStore implements DeliveryAttemptStore {
  readonly accepted: ProviderMessage[] = [];
  readonly failed: string[] = [];

  constructor(
    private readonly known: DeliveryAttempt | null = null,
    private readonly failAccept = false,
  ) {}

  async findByIdempotencyKey(): Promise<DeliveryAttempt | null> {
    return this.known;
  }

  async markAccepted(_attemptId: string, receipt: ProviderMessage): Promise<void> {
    if (this.failAccept) throw new Error("synthetic crash after provider accepted");
    this.accepted.push(receipt);
  }

  async markFailed(_attemptId: string, errorCode: string): Promise<void> {
    this.failed.push(errorCode);
  }
}

describe("M11-02 idempotent delivery", () => {
  it("reconciles provider acceptance after a crash before local persistence", async () => {
    const provider = new FakeProvider();
    await expect(deliverIdempotently(attempt(), message, provider, new FakeStore(null, true)))
      .rejects.toThrow("DELIVERY_STATE_PERSISTENCE_FAILED");

    const secondStore = new FakeStore();
    await expect(deliverIdempotently(attempt(), message, provider, secondStore)).resolves.toEqual({
      status: "reconciled",
      providerMessageId: "provider-1",
    });
    expect(provider.sent).toHaveLength(1);
    expect(secondStore.accepted).toHaveLength(1);
  });

  it("does not call provider when provider ID is already recorded", async () => {
    const provider = new FakeProvider();
    await expect(deliverIdempotently(
      attempt({ status: "accepted", providerMessageId: "provider-existing" }),
      message,
      provider,
      new FakeStore(),
    )).resolves.toEqual({ status: "already_recorded", providerMessageId: "provider-existing" });
    expect(provider.sent).toHaveLength(0);
  });

  it("dedupes against a persisted attempt from another worker", async () => {
    const provider = new FakeProvider();
    const known = attempt({ status: "sent", providerMessageId: "provider-known" });
    await expect(deliverIdempotently(attempt(), message, provider, new FakeStore(known))).resolves.toEqual({
      status: "already_recorded",
      providerMessageId: "provider-known",
    });
    expect(provider.sent).toHaveLength(0);
  });

  it("records a provider failure for bounded retry", async () => {
    const provider: DeliveryProvider = {
      reconcile: async () => null,
      send: async () => {
        throw new DeliveryProviderError("RATE_LIMITED");
      },
    };
    const store = new FakeStore();
    await expect(deliverIdempotently(attempt(), message, provider, store)).resolves.toEqual({
      status: "failed",
      errorCode: "RATE_LIMITED",
    });
    expect(store.failed).toEqual(["RATE_LIMITED"]);
  });
});
