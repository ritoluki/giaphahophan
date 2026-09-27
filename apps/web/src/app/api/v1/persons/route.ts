import { personSearchMatchSchema, personSearchQuerySchema, personSearchResultSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, rpcErrorStatus } from "@/lib/server/supabase-api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function searchResponse(data: unknown, page: { nextCursor: string | null; hasMore: boolean }, status = 200) {
  return Response.json(
    { data, meta: { requestId: crypto.randomUUID() }, page },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function decodeCursor(cursor: string | undefined): string | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = personSearchResultSchema.shape.id.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function encodeCursor(personId: string): string {
  return Buffer.from(personId, "utf8").toString("base64url");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = personSearchQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return apiJson({ code: "INVALID_PERSON_SEARCH", message: "Search requires at least two characters" }, 400);

  const cursorPersonId = decodeCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursorPersonId) return apiJson({ code: "INVALID_PERSON_CURSOR", message: "Cursor is invalid or expired" }, 400);

  const client = await createRequestSupabaseClient();
  const { data, error } = await client.schema("api").rpc("persons_search", {
    p_query: parsed.data.q,
    p_branch_id: parsed.data.branchId ?? null,
    p_life_status: parsed.data.lifeStatus ?? null,
    p_birth_year: parsed.data.birthYear ?? null,
    p_sort: parsed.data.sort,
    p_cursor_person_id: cursorPersonId,
    p_limit: parsed.data.limit + 1
  });
  if (error) return apiJson({ code: "PERSON_SEARCH_FAILED", message: "Authorized person search is unavailable" }, rpcErrorStatus(error.code));

  try {
    const rows: unknown[] = Array.isArray(data) ? data : [];
    const results = rows.map((value) => {
      if (!isRecord(value)) throw new Error("Invalid person search row");
      const matchedNames = Array.isArray(value.matched_names)
        ? value.matched_names.map((name) => personSearchMatchSchema.parse(name))
        : [];
      return personSearchResultSchema.parse({
        id: value.id,
        version: value.version,
        code: value.code,
        displayName: value.display_name,
        lifeStatus: value.life_status,
        primaryBranchId: value.primary_branch_id,
        ...(typeof value.year_label === "string" ? { yearLabel: value.year_label } : {}),
        ...(typeof value.portrait_asset_id === "string" ? { portraitAssetId: value.portrait_asset_id } : {}),
        isDemo: value.is_demo,
        matchedNames
      });
    });
    const hasMore = results.length > parsed.data.limit;
    const pageResults = hasMore ? results.slice(0, parsed.data.limit) : results;
    const lastResult = pageResults.at(-1);
    return searchResponse(pageResults, { nextCursor: hasMore && lastResult ? encodeCursor(lastResult.id) : null, hasMore });
  } catch {
    return apiJson({ code: "PERSON_SEARCH_INVALID_RESPONSE", message: "Person search projection was invalid" }, 502);
  }
}