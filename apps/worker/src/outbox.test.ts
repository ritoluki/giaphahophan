import { describe, expect, it } from "vitest";

import {
  OutboxDispatchError,
  OutboxDispatcher,
  type OutboxEvent,
  type OutboxStore,
  retryDelaySeconds,
} from "./outbox";

const event = (overrides: Partial<OutboxEvent> = {}): OutboxEvent => ({
  id: "82000000-0000-4000-8000-000000000001",
  treeId: "12000000-0000-4000-8000-000000000001",
  eventType: "person.updated",
  resourceId: "32000000-0000-4000-8000-000000000001",
  resourceVersion: 2,
  dedupeKey: "jobs.synthetic.person.updated.1",
  requestedBy: "22000000-0000-4000-8000-000000000001",
  attempts: 1,
  maxAttempts: 5,
  ...overrides,
});

class FakeStore implements OutboxStore {
  readonly published: string[] = [];
  readonly failures: Array<{
    eventId: string;
    workerId: string;
    errorCode: string;
    retryDelaySeconds: number;
  }> = [];

  constructor(private readonly events: readonly OutboxEvent[]) {}

  async claim(_workerId: string, _limit: number): Promise<readonly OutboxEvent[]> {
    return this.events;
  }

  async markPublished(eventId: string, _workerId: string): Promise<boolean> {
    this.published.push(eventId);
    return true;
  }

  async markFailed(
    eventId: string,
    workerId: string,
    errorCode: string,
    retryDelaySeconds: number,
  ): Promise<boolean> {
    this.failures.push({ eventId, workerId, errorCode, retryDelaySeconds });
    return true;
  }
}

describe("OutboxDispatcher", () => {
  it("publishes a handled event exactly once", async () => {
    const store = new FakeStore([event()]);
    const handled: string[] = [];
    const dispatcher = new OutboxDispatcher(
      store,
      {
        "person.updated": async (outboxEvent) => {
          handled.push(outboxEvent.id);
        },
      },
      "92000000-0000-4000-8000-000000000001",
    );

    await expect(dispatcher.processOnce()).resolves.toEqual({
      claimed: 1,
      published: 1,
      failed: 0,
    });
    expect(handled).toEqual([event().id]);
    expect(store.published).toEqual([event().id]);
    expect(store.failures).toEqual([]);
  });

  it("records a typed handler failure with exponential retry delay", async () => {
    const store = new FakeStore([event({ attempts: 3 })]);
    const dispatcher = new OutboxDispatcher(
      store,
      {
        "person.updated": async () => {
          throw new Error("synthetic handler failure");
        },
      },
      "92000000-0000-4000-8000-000000000001",
      { retryBaseSeconds: 10, retryMaxSeconds: 60 },
    );

    await expect(dispatcher.processOnce()).resolves.toEqual({
      claimed: 1,
      published: 0,
      failed: 1,
    });
    expect(store.failures).toEqual([
      {
        eventId: event().id,
        workerId: "92000000-0000-4000-8000-000000000001",
        errorCode: "WORKER_HANDLER_FAILED",
        retryDelaySeconds: 40,
      },
    ]);
  });

  it("fails unsupported events without invoking a handler", async () => {
    const store = new FakeStore([event({ eventType: "unknown.event" })]);
    const dispatcher = new OutboxDispatcher(
      store,
      {},
      "92000000-0000-4000-8000-000000000001",
    );

    await expect(dispatcher.processOnce()).resolves.toEqual({
      claimed: 1,
      published: 0,
      failed: 1,
    });
    expect(store.failures[0]?.errorCode).toBe("UNSUPPORTED_EVENT");
  });

  it("keeps explicit dispatch errors typed and caps retry delay", async () => {
    const store = new FakeStore([event({ attempts: 20 })]);
    const dispatcher = new OutboxDispatcher(
      store,
      {
        "person.updated": async () => {
          throw new OutboxDispatchError("TARGET_NOT_FOUND");
        },
      },
      "92000000-0000-4000-8000-000000000001",
      { retryBaseSeconds: 30, retryMaxSeconds: 120 },
    );

    await dispatcher.processOnce();
    expect(store.failures[0]?.errorCode).toBe("TARGET_NOT_FOUND");
    expect(store.failures[0]?.retryDelaySeconds).toBe(120);
  });
});

describe("retryDelaySeconds", () => {
  it("is deterministic, exponential and bounded", () => {
    expect(retryDelaySeconds(1, 5, 100)).toBe(5);
    expect(retryDelaySeconds(2, 5, 100)).toBe(10);
    expect(retryDelaySeconds(5, 5, 100)).toBe(80);
    expect(retryDelaySeconds(6, 5, 100)).toBe(100);
    expect(retryDelaySeconds(0, 5, 100)).toBe(5);
  });
});
