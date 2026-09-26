import { parsePublicEnv } from "@phan/config";
import { personProjectionSchema } from "@phan/contracts";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

function response(data: unknown, status = 200) {
  return NextResponse.json(
    { data, meta: { requestId: crypto.randomUUID() } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function supabaseApiClient() {
  const env = parsePublicEnv({
    APP_ENV: process.env.APP_ENV,
    DATA_MODE: process.env.DATA_MODE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  });

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = personProjectionSchema.shape.id.safeParse(id);
  if (!parsedId.success) return response({ code: "INVALID_PERSON_ID", message: "Person id must be a UUID" }, 400);

  try {
    const { data, error } = await supabaseApiClient().schema("api").rpc("person_get", { p_person_id: parsedId.data });
    if (error) return response({ code: "PERSON_LOOKUP_FAILED", message: "Unable to read the authorized person projection" }, 502);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return response({ code: "PERSON_NOT_FOUND", message: "Person not found" }, 404);

    const projection = personProjectionSchema.parse({
      id: row.id,
      treeId: row.tree_id,
      code: row.code,
      displayName: row.display_name,
      recordedSex: row.recorded_sex,
      lifeStatus: row.life_status,
      visibility: row.visibility,
      protectedMinor: row.protected_minor,
      primaryBranchId: row.primary_branch_id,
      confidence: row.confidence
    });

    return response(projection);
  } catch {
    return response({ code: "PERSON_LOOKUP_UNAVAILABLE", message: "Authorized person projection is unavailable" }, 503);
  }
}
