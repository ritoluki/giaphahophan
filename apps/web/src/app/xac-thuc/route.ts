import { createRequestSupabaseClient } from "@/lib/server/supabase-api";

function safeNextPath(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/gia-pha";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeNextPath(url.searchParams.get("next"));

  if (!code) {
    return Response.redirect(new URL("/dang-nhap?error=missing_code", request.url));
  }

  const client = await createRequestSupabaseClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return Response.redirect(new URL("/dang-nhap?error=callback_failed", request.url));
  }

  return Response.redirect(new URL(nextPath, request.url));
}
