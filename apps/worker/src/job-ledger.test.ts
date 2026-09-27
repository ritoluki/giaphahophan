import { describe, expect, it } from "vitest";

import { summarizeJobCounters, transitionJob, type JobRecord } from "./job-ledger";

const job = (overrides: Partial<JobRecord> = {}): JobRecord => ({
  id: "job-1", status: "queued", attempts: 0, maxAttempts: 2, lastErrorCode: null, failureCodes: [], ...overrides,
});

describe("M11-04 job ledger", () => {
  it("claims queued work and only a processed job can succeed", () => {
    const processed = transitionJob(job(), { type: "claim" });
    expect(processed).toMatchObject({ status: "processed", attempts: 1 });
    expect(transitionJob(processed, { type: "succeed" })).toMatchObject({ status: "succeeded", lastErrorCode: null });
    expect(() => transitionJob(job(), { type: "succeed" })).toThrow("JOB_NOT_PROCESSED");
  });

  it("retains failure audit and permits bounded retry", () => {
    const firstFailure = transitionJob(transitionJob(job(), { type: "claim" }), { type: "fail", errorCode: "TEMPORARY" });
    expect(firstFailure).toMatchObject({ status: "failed", attempts: 1, lastErrorCode: "TEMPORARY", failureCodes: ["TEMPORARY"] });
    const retried = transitionJob(firstFailure, { type: "claim" });
    expect(transitionJob(retried, { type: "succeed" }).failureCodes).toEqual(["TEMPORARY"]);
  });

  it("does not claim after max attempts and never converts failure to success", () => {
    const exhausted = job({ status: "failed", attempts: 2, lastErrorCode: "PERMANENT", failureCodes: ["TEMPORARY", "PERMANENT"] });
    expect(() => transitionJob(exhausted, { type: "claim" })).toThrow("JOB_NOT_CLAIMABLE");
    expect(() => transitionJob(exhausted, { type: "succeed" })).toThrow("JOB_NOT_PROCESSED");
  });

  it("records explicit skips separately from failures", () => {
    expect(transitionJob(job(), { type: "skip", reason: "consent revoked" })).toMatchObject({ status: "skipped", lastErrorCode: "SKIPPED:consent revoked" });
  });

  it("summarizes counters without treating queued or failed as success", () => {
    expect(summarizeJobCounters([
      job(), job({ id: "job-2", status: "processed" }), job({ id: "job-3", status: "succeeded" }),
      job({ id: "job-4", status: "failed" }), job({ id: "job-5", status: "skipped" }),
    ])).toEqual({ queued: 1, processed: 1, succeeded: 1, failed: 1, skipped: 1 });
  });
});
