import { loginInputSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient } from "@/lib/server/supabase-api";

export async function POST(request: Request) {
  let input: ReturnType<typeof loginInputSchema.parse>;
  try {
    input = loginInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_LOGIN", message: "Login payload is invalid" }, 400);
  }

  const client = await createRequestSupabaseClient();
  const { error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password
  });

  if (error) {
    return apiJson({ code: "LOGIN_FAILED", message: "Email or password was not accepted" }, 401);
  }

  return apiJson({ authenticated: true });
}
