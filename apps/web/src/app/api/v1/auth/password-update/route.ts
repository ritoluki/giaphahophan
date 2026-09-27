import { passwordUpdateInputSchema, passwordUpdateResultSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser } from "@/lib/server/supabase-api";

export async function POST(request: Request) {
  let input: ReturnType<typeof passwordUpdateInputSchema.parse>;
  try {
    input = passwordUpdateInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_PASSWORD_UPDATE", message: "Password payload is invalid" }, 400);
  }

  const client = await createRequestSupabaseClient();
  const user = await getVerifiedUser(client);
  if (!user) return apiJson({ code: "AUTH_REQUIRED", message: "Authentication is required" }, 401);

  const { error } = await client.auth.updateUser({ password: input.password });
  if (error) return apiJson({ code: "PASSWORD_UPDATE_FAILED", message: "Password could not be updated" }, 400);

  return apiJson(passwordUpdateResultSchema.parse({ updated: true }));
}