import { describe, expect, it } from "vitest";
import { createLatestSearchRequestCoordinator } from "./search-request";

describe("latest search request coordinator", () => {
  it("aborts the previous request and ignores its result", () => {
    const coordinator = createLatestSearchRequestCoordinator();
    const first = coordinator.begin();
    const second = coordinator.begin();

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("cancels an in-flight request on cleanup", () => {
    const coordinator = createLatestSearchRequestCoordinator();
    const request = coordinator.begin();
    coordinator.cancel();

    expect(request.signal.aborted).toBe(true);
    expect(request.isCurrent()).toBe(false);
  });
});
