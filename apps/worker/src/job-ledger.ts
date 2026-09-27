export type JobStatus = "queued" | "processed" | "succeeded" | "failed" | "skipped";

export type JobRecord = {
  readonly id: string;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastErrorCode: string | null;
  readonly failureCodes: readonly string[];
};

export type JobAction =
  | { type: "claim" }
  | { type: "succeed" }
  | { type: "fail"; errorCode: string }
  | { type: "skip"; reason: string };

export type JobCounters = Record<JobStatus, number>;

function validErrorCode(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= 100;
}

export function transitionJob(job: JobRecord, action: JobAction): JobRecord {
  if (!Number.isInteger(job.attempts) || job.attempts < 0 || !Number.isInteger(job.maxAttempts) || job.maxAttempts < 1) {
    throw new RangeError("job attempt bounds are invalid");
  }
  if (action.type === "claim") {
    if (job.status === "queued" || (job.status === "failed" && job.attempts < job.maxAttempts)) {
      return { ...job, status: "processed", attempts: job.attempts + 1 };
    }
    throw new Error("JOB_NOT_CLAIMABLE");
  }
  if (action.type === "succeed") {
    if (job.status !== "processed") throw new Error("JOB_NOT_PROCESSED");
    return { ...job, status: "succeeded", lastErrorCode: null };
  }
  if (action.type === "fail") {
    if (job.status !== "processed") throw new Error("JOB_NOT_PROCESSED");
    const errorCode = action.errorCode.trim();
    if (!validErrorCode(errorCode)) throw new RangeError("job error code is required and bounded");
    return {
      ...job,
      status: "failed",
      lastErrorCode: errorCode,
      failureCodes: [...job.failureCodes, errorCode],
    };
  }
  if (job.status !== "queued" && job.status !== "failed") throw new Error("JOB_NOT_SKIPPABLE");
  const reason = action.reason.trim();
  if (reason.length < 3 || reason.length > 200) throw new RangeError("skip reason is required and bounded");
  return { ...job, status: "skipped", lastErrorCode: `SKIPPED:${reason}` };
}

export function summarizeJobCounters(jobs: ReadonlyArray<JobRecord>): JobCounters {
  const counters: JobCounters = { queued: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  for (const job of jobs) counters[job.status] += 1;
  return counters;
}
