import { authRecoveryInputSchema, authRecoveryResultSchema, idempotencyKeySchema } from "@phan/contracts";
import { parsePublicEnv } from "@phan/config";
import { apiJson, createRequestSupabaseClient } from "@/lib/server/supabase-api";

function recoveryRedirectUrl() {
  const env = parsePublicEnv({
    APP_ENV: process.env.APP_ENV,
    DATA_MODE: process.env.DATA_MODE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  });
  const redirect = new URL("/xac-thuc", env.NEXT_PUBLIC_APP_URL);
  redirect.searchParams.set("next", "/quen-mat-khau?mode=reset");
  return redirect.toString();
}

export async function POST(request: Request) {
  let input: ReturnType<typeof authRecoveryInputSchema.parse>;
  try {
    input = authRecoveryInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_RECOVERY_REQUEST", message: "Recovery payload is invalid" }, 400);
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || !idempotencyKeySchema.safeParse(idempotencyKey).success) {
    return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "A valid idempotency key is required" }, 428);
  }

  try {
    const client = await createRequestSupabaseClient();
    const { error } = await client.auth.resetPasswordForEmail(input.email, {
      redirectTo: recoveryRedirectUrl()
    });

    // Supabase intentionally does not reveal whether an email exists.
    if (error && !/rate limit|too many requests/i.test(error.message)) {
      return apiJson({ code: "RECOVERY_UNAVAILABLE", message: "Recovery service is temporarily unavailable" }, 503);
    }

    return apiJson(authRecoveryResultSchema.parse({ accepted: true }));
  } catch {
    return apiJson({ code: "RECOVERY_UNAVAILABLE", message: "Recovery service is temporarily unavailable" }, 503);
  }
}