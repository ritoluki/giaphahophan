import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { idempotencyKeySchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser } from "./supabase-api";

export async function readPrivateMutation(request: Request, options: { csrfCookie: string; prefix: "IMPORT" | "EXPORT" }) {
  const origin = request.headers.get("Origin");
  const token = request.headers.get("X-CSRF-Token") ?? "";
  const stored = (await cookies()).get(options.csrfCookie)?.value ?? "";
  if (origin !== new URL(request.url).origin || !/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(stored)
      || !timingSafeEqual(Buffer.from(stored), Buffer.from(token))) {
    return { ok: false as const, response: apiJson({ code: "CSRF_INVALID", message: "Phiên xác nhận đã hết hạn. Hãy tải lại trạng thái." }, 403) };
  }
  const key = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) return { ok: false as const, response: apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Thiếu mã thao tác." }, 428) };
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false as const, response: apiJson({ code: `${options.prefix}_REQUEST_INVALID`, message: "Yêu cầu không hợp lệ." }, 400) };
  }
  const reader = request.body?.getReader();
  let value: unknown;
  try {
    if (!reader) throw new Error("body_required");
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) { await reader.cancel(); return { ok: false as const, response: apiJson({ code: `${options.prefix}_REQUEST_TOO_LARGE`, message: "Yêu cầu quá lớn." }, 413) }; }
      parts.push(part.value);
    }
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
  } catch {
    return { ok: false as const, response: apiJson({ code: `${options.prefix}_REQUEST_INVALID`, message: "Yêu cầu không hợp lệ." }, 400) };
  }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return { ok: false as const, response: apiJson({ code: "AUTH_REQUIRED", message: "Cần đăng nhập để tiếp tục." }, 401) };
  return { ok: true as const, client, key: key.data, value };
}
