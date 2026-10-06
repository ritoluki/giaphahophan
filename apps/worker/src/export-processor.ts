import { createHash } from "node:crypto";
import {
  exportJobSchema,
  exportProjectionSchema,
  type ExportJob,
  type ExportProjection,
} from "@phan/contracts";
import {
  serializeExportCsv,
  serializeExportGedcom551,
  serializeExportGedcom7,
  serializeExportJson,
  type SerializedExport,
} from "@phan/domain";

export type ExportArtifact = {
  readonly objectPath: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly content: Uint8Array;
  readonly sha256: string;
};

export type ExportLease = {
  readonly job: ExportJob;
  readonly leaseId: string;
  readonly leaseExpiresAt: string;
};

export interface ExportProcessingStore {
  /** Atomically claim one queued job and persist the running lease. */
  claim(workerId: string): Promise<ExportLease | null>;
  /** Re-check live actor/session/MFA/capability/policy and return only the redacted projection. */
  loadCurrentAuthorizedProjection(lease: ExportLease): Promise<unknown>;
  /** Conditional create in private storage; retries must verify an existing object's digest. */
  putPrivateArtifact(lease: ExportLease, artifact: ExportArtifact): Promise<void>;
  /** Must atomically recheck lease, expiry, cancellation and current authorization before completion. */
  completeIfAuthorized(lease: ExportLease, input: {
    readonly artifacts: readonly Pick<ExportArtifact, "objectPath" | "fileName" | "contentType" | "sha256">[];
    readonly warnings: readonly string[];
  }): Promise<boolean>;
  /** Conditional on the same lease; accepts only a non-PII machine error code. */
  failIfLeased(lease: ExportLease, errorCode: string): Promise<boolean>;
  /** Delete only deterministic objects owned by this job/lease; persist a cleanup task before rejecting if deletion is uncertain. */
  removePrivateArtifacts(lease: ExportLease, objectPaths: readonly string[]): Promise<void>;
}

export type ExportProcessResult =
  | { readonly status: "idle" }
  | { readonly status: "completed"; readonly jobId: string; readonly artifactCount: number }
  | { readonly status: "cancelled_or_lease_lost"; readonly jobId: string }
  | { readonly status: "failed"; readonly jobId: string; readonly errorCode: string };

export class ExportProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ExportProcessingError";
  }
}

function serialize(format: ExportJob["format"], projection: ExportProjection): SerializedExport {
  switch (format) {
    case "canonical_json": return serializeExportJson(projection);
    case "csv": return serializeExportCsv(projection);
    case "gedcom_551": return serializeExportGedcom551(projection);
    case "gedcom_7": return serializeExportGedcom7(projection);
    case "book_pdf":
    case "svg":
      throw new ExportProcessingError("EXPORT_RENDERER_NOT_IMPLEMENTED");
  }
}

function artifact(lease: ExportLease, suffix: string, contentType: string, content: string): ExportArtifact {
  const jobId = lease.job.id;
  const objectPath = `${lease.job.treeId}/${jobId}/${suffix}`;
  const bytes = new TextEncoder().encode(content);
  const digest = createHash("sha256").update(bytes).digest("hex");
  return {
    objectPath,
    fileName: `phan-gia-pha-${jobId}-${suffix}`,
    contentType,
    content: bytes,
    sha256: digest,
  };
}

function buildArtifacts(lease: ExportLease, projectionInput: unknown): {
  readonly artifacts: readonly ExportArtifact[];
  readonly warnings: readonly string[];
} {
  const job = exportJobSchema.parse(lease.job);
  const projection = exportProjectionSchema.parse(projectionInput);
  if (projection.treeId !== job.treeId || projection.policyVersion !== job.policyVersion
    || JSON.stringify(projection.scope) !== JSON.stringify(job.scope)) {
    throw new ExportProcessingError("EXPORT_PROJECTION_CONTEXT_MISMATCH");
  }

  const output = serialize(job.format, projection);
  const artifacts = [artifact(lease, `primary.${output.extension}`, output.mimeType, output.content)];
  if (output.sidecarContent !== undefined && output.sidecarExtension !== undefined && output.sidecarMimeType !== undefined) {
    artifacts.push(artifact(lease, `sidecar.${output.sidecarExtension}`, output.sidecarMimeType, output.sidecarContent));
  }
  return { artifacts, warnings: output.warnings };
}

export async function processOneExport(
  store: ExportProcessingStore,
  workerId: string,
): Promise<ExportProcessResult> {
  const lease = await store.claim(workerId);
  if (lease === null) return { status: "idle" };

  const objectPaths: string[] = [];
  try {
    const projection = await store.loadCurrentAuthorizedProjection(lease);
    const built = buildArtifacts(lease, projection);
    for (const item of built.artifacts) {
      // Track before the remote write: a timeout can occur after Storage accepted bytes.
      objectPaths.push(item.objectPath);
      await store.putPrivateArtifact(lease, item);
    }
    const completed = await store.completeIfAuthorized(lease, {
      artifacts: built.artifacts.map(({ objectPath, fileName, contentType, sha256 }) => ({ objectPath, fileName, contentType, sha256 })),
      warnings: built.warnings,
    });
    if (!completed) {
      await store.removePrivateArtifacts(lease, objectPaths);
      return { status: "cancelled_or_lease_lost", jobId: lease.job.id };
    }
    return { status: "completed", jobId: lease.job.id, artifactCount: built.artifacts.length };
  } catch (error: unknown) {
    const code = error instanceof ExportProcessingError ? error.code : "EXPORT_PROCESSING_FAILED";
    try {
      await store.removePrivateArtifacts(lease, objectPaths);
    } catch {
      // The private object reconciler must remove lease-scoped orphaned objects later.
    }
    try {
      const markedFailed = await store.failIfLeased(lease, code);
      if (!markedFailed) return { status: "cancelled_or_lease_lost", jobId: lease.job.id };
    } catch {
      // A lost lease must not be overwritten; the lease reconciler owns recovery.
      return { status: "cancelled_or_lease_lost", jobId: lease.job.id };
    }
    return { status: "failed", jobId: lease.job.id, errorCode: code };
  }
}
