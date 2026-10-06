import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ExportJob, ExportProjection } from "@phan/contracts";
import {
  processOneExport,
  type ExportLease,
  type ExportProcessingStore,
  type ExportArtifact,
} from "./export-processor";
import { chromiumSandboxEnabled, createExportBookHtml } from "./export-book-pdf";

const personId = "a6600000-0000-4000-8000-000000000001";
const treeId = "a6600000-0000-4000-8000-000000000002";
const job: ExportJob = {
  id: "a6600000-0000-4000-8000-000000000003", treeId, version: 2,
  format: "gedcom_7", scope: { kind: "tree" }, policyVersion: 4,
  audience: "members", includeMedia: false, status: "running",
  expiresAt: "2027-01-01T00:00:00Z", warnings: [],
};
const projection: ExportProjection = {
  schemaVersion: "phan-export/1", treeId, policyVersion: 4,
  generatedAt: "2026-01-01T00:00:00Z", isDemo: true, scope: { kind: "tree" },
  people: [{ id: personId, version: 1, code: "DEMO-1", displayName: "Người hư cấu", names: [], recordedSex: null, lifeStatus: "deceased", facts: [] }],
  parentLinks: [], unions: [], sources: [], citations: [],
};

class Store implements ExportProcessingStore {
  readonly uploaded: ExportArtifact[] = [];
  readonly removed: string[][] = [];
  readonly completedInputs: Parameters<ExportProcessingStore["completeIfAuthorized"]>[1][] = [];
  failedCodes: string[] = [];
  complete = true;
  throwAfterUpload = false;
  failUpdate = true;
  projectionValue: unknown = projection;

  async claim(_workerId: string): Promise<ExportLease> {
    return { job, leaseId: "lease-test", leaseExpiresAt: "2026-10-06T13:00:00Z", cleanupPaths: [] };
  }
  async loadCurrentAuthorizedProjection(_lease: ExportLease): Promise<unknown> { return this.projectionValue; }
  async putPrivateArtifact(_lease: ExportLease, item: ExportArtifact): Promise<void> {
    this.uploaded.push(item);
    if (this.throwAfterUpload) throw new Error("remote response lost after write");
  }
  async completeIfAuthorized(_lease: ExportLease, input: Parameters<ExportProcessingStore["completeIfAuthorized"]>[1]): Promise<boolean> {
    this.completedInputs.push(input);
    return this.complete;
  }
  async failIfLeased(_lease: ExportLease, errorCode: string): Promise<boolean> { this.failedCodes.push(errorCode); return this.failUpdate; }
  async removePrivateArtifacts(_lease: ExportLease, objectPaths: readonly string[]): Promise<void> { this.removed.push([...objectPaths]); }
}

describe("M16 export worker orchestration", () => {
  it("keeps Chromium sandbox mandatory outside local synthetic demo mode", () => {
    expect(chromiumSandboxEnabled({ APP_ENV: "development", DATA_MODE: "demo" })).toBe(false);
    expect(chromiumSandboxEnabled({ APP_ENV: "test", DATA_MODE: "demo" })).toBe(false);
    expect(chromiumSandboxEnabled({ APP_ENV: "staging", DATA_MODE: "demo" })).toBe(true);
    expect(chromiumSandboxEnabled({ APP_ENV: "production", DATA_MODE: "real" })).toBe(true);
    expect(chromiumSandboxEnabled({ APP_ENV: "production", DATA_MODE: "demo" })).toBe(true);
  });

  it("embeds local Vietnamese font subsets and their full OFL notices in book HTML", () => {
    const html = createExportBookHtml(projection);
    expect(html).toContain("font-src data:");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain("U+1EA0-1EF9");
    expect(html).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(html).toContain("NotoSans-Italic");
    expect(html).toContain("NotoSerif-Italic");
  });

  it("serializes only the reauthorized projection and persists private GEDCOM plus JSON sidecar metadata", async () => {
    const store = new Store();
    const result = await processOneExport(store, "worker-synthetic");
    expect(result).toEqual({ status: "completed", jobId: job.id, artifactCount: 2 });
    expect(store.uploaded.map((item) => item.objectPath)).toEqual([
      `${treeId}/${job.id}/primary.ged`, `${treeId}/${job.id}/sidecar.json`,
    ]);
    expect(store.uploaded[0]?.contentType).toBe("text/plain");
    expect(store.uploaded[1]?.contentType).toBe("application/json");
    for (const item of store.uploaded) {
      expect(item.sha256).toBe(createHash("sha256").update(item.content).digest("hex"));
      expect(item.objectPath).not.toContain(personId);
    }
    expect(store.completedInputs[0]?.warnings).toContain("gedcom_subset_not_lossless_json_sidecar_attached");
    expect(store.removed).toEqual([]);
  });

  it("removes lease-scoped private objects when cancellation or lease loss wins completion", async () => {
    const store = new Store(); store.complete = false;
    expect(await processOneExport(store, "worker-synthetic")).toEqual({ status: "cancelled_or_lease_lost", jobId: job.id });
    expect(store.removed).toEqual([[`${treeId}/${job.id}/primary.ged`, `${treeId}/${job.id}/sidecar.json`]]);
    expect(store.failedCodes).toEqual([]);
  });

  it("fails closed on an invalid or stale projection and never uploads an artifact", async () => {
    const store = new Store(); store.projectionValue = { ...projection, policyVersion: 3 };
    expect(await processOneExport(store, "worker-synthetic")).toEqual({ status: "failed", jobId: job.id, errorCode: "EXPORT_PROJECTION_CONTEXT_MISMATCH" });
    expect(store.uploaded).toEqual([]);
    expect(store.failedCodes).toEqual(["EXPORT_PROJECTION_CONTEXT_MISMATCH"]);
  });

  it("renders a private book PDF in Chromium with the authorized projection", async () => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("DATA_MODE", "demo");
    const store = new Store();
    store.claim = async () => ({ ...await Store.prototype.claim.call(store, "worker-synthetic"), job: { ...job, format: "book_pdf" } });
    try {
      expect(await processOneExport(store, "worker-synthetic")).toEqual({ status: "completed", jobId: job.id, artifactCount: 1 });
      expect(store.uploaded).toHaveLength(1);
      expect(store.uploaded[0]?.objectPath).toBe(`${treeId}/${job.id}/primary.pdf`);
      expect(store.uploaded[0]?.contentType).toBe("application/pdf");
      expect(new TextDecoder().decode(store.uploaded[0]?.content.slice(0, 5))).toBe("%PDF-");
      const pdf = Buffer.from(store.uploaded[0]?.content ?? []).toString("latin1");
      expect(pdf).toMatch(/\/FontFile[23]?\s+\d+\s+\d+\s+R/);
      expect(store.completedInputs[0]?.artifacts[0]?.sizeBytes).toBe(store.uploaded[0]?.sizeBytes);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 15_000);

  it("never claims media packaging succeeded while private media projection is not implemented", async () => {
    const store = new Store();
    store.claim = async () => ({ ...await Store.prototype.claim.call(store, "worker-synthetic"), job: { ...job, includeMedia: true } });
    expect(await processOneExport(store, "worker-synthetic")).toEqual({ status: "failed", jobId: job.id, errorCode: "EXPORT_MEDIA_PACKAGING_NOT_IMPLEMENTED" });
    expect(store.uploaded).toEqual([]);
    expect(store.failedCodes).toEqual(["EXPORT_MEDIA_PACKAGING_NOT_IMPLEMENTED"]);
  });

  it("reconciles an upload whose remote write succeeded but response failed", async () => {
    const store = new Store(); store.throwAfterUpload = true;
    expect(await processOneExport(store, "worker-synthetic")).toEqual({ status: "failed", jobId: job.id, errorCode: "EXPORT_PROCESSING_FAILED" });
    expect(store.removed).toEqual([[`${treeId}/${job.id}/primary.ged`]]);
    expect(store.failedCodes).toEqual(["EXPORT_PROCESSING_FAILED"]);
  });

  it("does not overwrite a terminal state after the lease expires during processing", async () => {
    const store = new Store(); store.failUpdate = false; store.projectionValue = null;
    expect(await processOneExport(store, "worker-synthetic")).toEqual({ status: "cancelled_or_lease_lost", jobId: job.id });
    expect(store.failedCodes).toEqual(["EXPORT_PROCESSING_FAILED"]);
  });
});
