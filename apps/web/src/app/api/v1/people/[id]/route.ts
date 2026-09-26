import { parsePublicEnv } from "@phan/config";
import { personIdentityProjectionSchema, personProjectionSchema } from "@phan/contracts";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
    const client = supabaseApiClient().schema("api");
    const [personResult, namesResult] = await Promise.all([
      client.rpc("person_get", { p_person_id: parsedId.data }),
      client.rpc("person_names_get", { p_person_id: parsedId.data })
    ]);
    if (personResult.error || namesResult.error) {
      return response({ code: "PERSON_LOOKUP_FAILED", message: "Unable to read the authorized person projection" }, 502);
    }

    const row = Array.isArray(personResult.data) ? personResult.data[0] : personResult.data;
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
    const nameRows: unknown[] = Array.isArray(namesResult.data) ? namesResult.data : [];
    const names = nameRows.map((nameRow) => {
      if (!isRecord(nameRow)) throw new Error("Invalid person name projection");
      return {
        id: nameRow.id,
        personId: nameRow.person_id,
        name: nameRow.name,
        nameSearch: nameRow.name_search,
        kind: nameRow.kind,
        isPreferred: nameRow.is_preferred
      };
    });

    return response(personIdentityProjectionSchema.parse({ ...projection, names }));
  } catch {
    return response({ code: "PERSON_LOOKUP_UNAVAILABLE", message: "Authorized person projection is unavailable" }, 503);
  }
}
