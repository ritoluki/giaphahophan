import { createHash } from "node:crypto";
import { membershipSchema } from "@phan/contracts";
import { z } from "zod";
import { createRequestSupabaseClient, getVerifiedUser } from "@/lib/server/supabase-api";

const manifestSchema = z.object({
  files: z.array(z.object({
    objectPath: z.string().min(1).max(200), fileName: z.string().min(1).max(200),
    contentType: z.string().min(1).max(100), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive().max(104_857_600),
  }).strict()).min(1).max(2),
}).strict();

const unavailable = (): Response => Response.json(
  { data: { code: "EXPORT_ARTIFACT_UNAVAILABLE", message: "Tệp xuất không khả dụng hoặc quyền truy cập đã thay đổi." }, meta: { requestId: crypto.randomUUID() } },
  { status: 404, headers: { "Cache-Control": "private, no-store" } },
);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const jobId = membershipSchema.shape.id.safeParse((await context.params).id);
  const file = new URL(request.url).searchParams.get("file") ?? "primary";
  if (!jobId.success || !["primary", "sidecar"].includes(file)) return unavailable();

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) {
    return Response.json({ data: { code: "AUTH_REQUIRED", message: "Cần đăng nhập." }, meta: { requestId: crypto.randomUUID() } },
      { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const { data: manifestData, error: manifestError } = await client.schema("api").rpc("export_download_manifest", { p_job_id: jobId.data });
  const manifest = manifestSchema.safeParse(manifestData);
  if (manifestError || !manifest.success) return unavailable();
  const selected = manifest.data.files.find((entry) => file === "sidecar"
    ? entry.fileName.endsWith("-sidecar.json")
    : entry.fileName.includes("-primary."));
  if (!selected || !new RegExp(`^phan-gia-pha-${jobId.data}-(primary\\.(json|csv|ged|pdf|svg)|sidecar\\.json)$`).test(selected.fileName)) return unavailable();

  const { data: blob, error: downloadError } = await client.storage.from("export-artifacts").download(selected.objectPath);
  if (downloadError || !blob || blob.size !== selected.sizeBytes) return unavailable();
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== selected.sha256) return unavailable();
  return new Response(bytes, {
    headers: {
      "Content-Type": selected.contentType,
      "Content-Length": String(selected.sizeBytes),
      "Content-Disposition": `attachment; filename="${selected.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
