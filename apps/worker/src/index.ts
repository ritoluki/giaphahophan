import { randomUUID } from "node:crypto";
import { parsePublicEnv } from "@phan/config";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ExportProcessingError, processOneExport } from "./export-processor";
import { SupabaseExportProcessingStore } from "./supabase-export-store";

const env = parsePublicEnv(process.env);
const serviceRoleKey = z.string().min(1).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(supabaseUrl.hostname)
  || !["development", "test"].includes(env.APP_ENV) || env.DATA_MODE !== "demo") {
  throw new Error("M16 export worker is restricted to a local demo Supabase instance");
}
const pollMs = z.coerce.number().int().min(250).max(60_000).default(1_500)
  .parse(process.env.EXPORT_WORKER_POLL_MS ?? "1500");
const workerId = randomUUID();
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const store = new SupabaseExportProcessingStore(client);
const abort = new AbortController();

console.info(JSON.stringify({ event: "worker_boot", appEnv: env.APP_ENV, dataMode: env.DATA_MODE, pollMs }));
process.once("SIGINT", () => abort.abort("SIGINT"));
process.once("SIGTERM", () => abort.abort("SIGTERM"));

const sleep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

try {
  while (!abort.signal.aborted) {
    try {
      const result = await processOneExport(store, workerId);
      if (result.status === "idle") await sleep(pollMs);
      else console.info(JSON.stringify({ event: "export_job_processed", status: result.status, artifactCount: result.status === "completed" ? result.artifactCount : undefined, errorCode: result.status === "failed" ? result.errorCode : undefined }));
    } catch (error: unknown) {
      const errorCode = error instanceof ExportProcessingError ? error.code : "EXPORT_WORKER_TICK_FAILED";
      console.error(JSON.stringify({ event: "export_worker_tick_failed", errorCode }));
      await sleep(pollMs);
    }
  }
} finally {
  console.info(JSON.stringify({ event: "worker_shutdown", signal: abort.signal.reason ?? "shutdown" }));
}
