import { membershipSchema } from "@phan/contracts";
import { apiJson } from "./supabase-api";
import { readPrivateMutation } from "./private-mutations";

export const IMPORT_CSRF_COOKIE = "pgp-import-csrf";

export async function readImportMutation(request: Request, id: string) {
  const parsedId = membershipSchema.shape.id.safeParse(id);
  if (!parsedId.success) return { ok: false as const, response: apiJson({ code: "IMPORT_NOT_FOUND", message: "Không tìm thấy bản nhập." }, 404) };
  const mutation = await readPrivateMutation(request, { csrfCookie: IMPORT_CSRF_COOKIE, prefix: "IMPORT" });
  return mutation.ok ? { ...mutation, id: parsedId.data } : mutation;
}
