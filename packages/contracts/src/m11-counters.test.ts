import { describe, expect, it } from "vitest";

import { jobCountersSchema, jobStatusSchema } from "./index";

describe("M11-04 job counter contracts", () => {
  it("keeps job statuses distinct", () => {
    expect(jobStatusSchema.options).toHaveLength(5);
    expect(jobCountersSchema.parse({ queued: 1, processed: 2, succeeded: 3, failed: 4, skipped: 5 })).toEqual({
      queued: 1, processed: 2, succeeded: 3, failed: 4, skipped: 5,
    });
  });
  it("rejects negative counters", () => {
    expect(() => jobCountersSchema.parse({ queued: -1, processed: 0, succeeded: 0, failed: 0, skipped: 0 })).toThrow();
  });
});
