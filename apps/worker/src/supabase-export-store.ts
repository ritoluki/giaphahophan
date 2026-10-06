import { Buffer } from "node:buffer";
import { exportJobSchema, exportProjectionSchema, type ExportJob } from "@phan/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ExportProcessingError, type ExportArtifact, type ExportLease, type ExportProcessingStore } from "./export-processor";

const workerClaimSchema = z.object({
  job: z.object({
    id: z.string().uuid(), treeId: z.string().uuid(), version: z.number().int().positive(),
    format: z.enum(["json", "canonical_json", "csv", "gedcom_551", "gedcom_7", "pdf", "book_pdf", "svg"]),
    scope: z.unknown(), policyVersion: z.number().int().positive(), audience: z.enum(["self", "members", "public"]),
    includeMedia: z.boolean(), status: z.enum(["queued", "running", "complete", "failed", "cancelled"]),
    expiresAt: z.string().datetime({ offset: true }), warnings: z.array(z.string().max(200)).max(200),
  }).strict(),
  leaseId: z.string().uuid(), leaseExpiresAt: z.string().datetime({ offset: true }),
  cleanupPaths: z.array(z.string().min(1).max(200)).max(2),
}).strict();

const formatMap = {
  json: "canonical_json", canonical_json: "canonical_json", csv: "csv", gedcom_551: "gedcom_551", gedcom_7: "gedcom_7",
  pdf: "book_pdf", book_pdf: "book_pdf", svg: "svg",
} as const;

function jobFromRpc(input: z.infer<typeof workerClaimSchema>["job"]): ExportJob {
  return exportJobSchema.parse({ ...input, format: formatMap[input.format] });
}

export class SupabaseExportProcessingStore implements ExportProcessingStore {
  constructor(private readonly client: SupabaseClient) {}

  async claim(workerId: string): Promise<ExportLease | null> {
    this.currentWorkerId = z.string().uuid().parse(workerId);
    const { data, error } = await this.client.schema("api").rpc("export_worker_claim", { p_worker_id: this.currentWorkerId, p_lease_seconds: 120 });
    if (error) throw new ExportProcessingError("EXPORT_CLAIM_FAILED");
    if (data === null) return null;
    const parsed = workerClaimSchema.safeParse(data);
    if (!parsed.success) throw new ExportProcessingError("EXPORT_CLAIM_RESPONSE_INVALID");
    return { ...parsed.data, job: jobFromRpc(parsed.data.job) };
  }

  async loadCurrentAuthorizedProjection(lease: ExportLease): Promise<unknown> {
    const { data, error } = await this.client.schema("api").rpc("export_worker_projection", {
      p_job_id: lease.job.id, p_worker_id: this.currentWorkerId, p_lease_id: lease.leaseId,
    });
    if (error) throw new ExportProcessingError("EXPORT_PROJECTION_UNAVAILABLE");
    const parsed = exportProjectionSchema.safeParse(data);
    if (!parsed.success) throw new ExportProcessingError("EXPORT_PROJECTION_INVALID");
    return parsed.data;
  }

  private currentWorkerId: string | null = null;

  private workerId(): string {
    if (this.currentWorkerId === null) throw new ExportProcessingError("EXPORT_WORKER_ID_MISSING");
    return this.currentWorkerId;
  }

  async putPrivateArtifact(lease: ExportLease, artifact: ExportArtifact): Promise<void> {
    const workerId = this.workerId();
    const { error: authorizationError, data: authorized } = await this.client.schema("api").rpc("export_worker_authorize_artifact", {
      p_job_id: lease.job.id, p_worker_id: workerId, p_lease_id: lease.leaseId,
      p_artifact: {
        objectPath: artifact.objectPath, fileName: artifact.fileName, contentType: artifact.contentType,
        sha256: artifact.sha256, sizeBytes: artifact.sizeBytes,
      },
    });
    if (authorizationError || authorized !== true) throw new ExportProcessingError("EXPORT_ARTIFACT_NOT_AUTHORIZED");

    const { error: uploadError } = await this.client.storage.from("export-artifacts").upload(
      artifact.objectPath,
      Buffer.from(artifact.content),
      { contentType: artifact.contentType, cacheControl: "0", upsert: false },
    );
    if (uploadError) {
      const status = uploadError.statusCode?.replace(/\D/g, "") || "UNKNOWN";
      throw new ExportProcessingError(`EXPORT_ARTIFACT_UPLOAD_FAILED_${status}`);
    }

    const { error: storedError, data: stored } = await this.client.schema("api").rpc("export_worker_artifact_stored", {
      p_job_id: lease.job.id, p_worker_id: workerId, p_lease_id: lease.leaseId, p_object_path: artifact.objectPath,
    });
    if (storedError || stored !== true) throw new ExportProcessingError("EXPORT_ARTIFACT_PERSIST_FAILED");
  }

  async completeIfAuthorized(lease: ExportLease, input: {
    readonly artifacts: readonly Pick<ExportArtifact, "objectPath" | "fileName" | "contentType" | "sha256" | "sizeBytes">[];
    readonly warnings: readonly string[];
  }): Promise<boolean> {
    const { data, error } = await this.client.schema("api").rpc("export_worker_complete", {
      p_job_id: lease.job.id, p_worker_id: this.workerId(), p_lease_id: lease.leaseId,
      p_manifest: input.artifacts, p_warnings: input.warnings,
    });
    if (error) throw new ExportProcessingError("EXPORT_COMPLETION_FAILED");
    return data === true;
  }

  async failIfLeased(lease: ExportLease, errorCode: string): Promise<boolean> {
    const safeCode = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/).parse(errorCode);
    const { data, error } = await this.client.schema("api").rpc("export_worker_fail", {
      p_job_id: lease.job.id, p_worker_id: this.workerId(), p_lease_id: lease.leaseId, p_error_code: safeCode,
    });
    if (error) throw new ExportProcessingError("EXPORT_FAILURE_UPDATE_FAILED");
    return data === true;
  }

  async removePrivateArtifacts(lease: ExportLease, objectPaths: readonly string[]): Promise<void> {
    if (objectPaths.length === 0) return;
    const workerId = this.workerId();
    const paths = z.array(z.string().min(1).max(200)).max(2).parse(objectPaths);
    const { data: authorized, error: authorizationError } = await this.client.schema("api").rpc("export_worker_cleanup_authorize", {
      p_job_id: lease.job.id, p_worker_id: workerId, p_lease_id: lease.leaseId, p_paths: paths,
    });
    if (authorizationError || authorized !== true) throw new ExportProcessingError("EXPORT_CLEANUP_NOT_AUTHORIZED");

    const { error: removeError } = await this.client.storage.from("export-artifacts").remove([...paths]);
    if (removeError) throw new ExportProcessingError("EXPORT_CLEANUP_FAILED");

    const { data: cleaned, error: completionError } = await this.client.schema("api").rpc("export_worker_cleanup_complete", {
      p_job_id: lease.job.id, p_worker_id: workerId, p_lease_id: lease.leaseId, p_paths: paths,
    });
    if (completionError || cleaned !== true) throw new ExportProcessingError("EXPORT_CLEANUP_NOT_RECORDED");
  }
}
