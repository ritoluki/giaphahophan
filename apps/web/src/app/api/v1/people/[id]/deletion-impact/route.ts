import { personDeletionImpactSchema, personProjectionSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = personProjectionSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_PERSON_ID", message: "Person id must be a UUID" }, 400);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("person_deletion_impact", { p_person_id: parsedId.data });
  if (error) return apiJson({ code: "PERSON_DELETION_IMPACT_FAILED", message: "Deletion impact is unavailable" }, rpcErrorStatus(error.code));
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) return apiJson({ code: "PERSON_NOT_FOUND", message: "Person not found" }, 404);

  return apiJson(personDeletionImpactSchema.parse({
    personId: row.person_id,
    treeId: row.tree_id,
    version: row.version,
    edgeCount: row.edge_count,
    factCount: row.fact_count,
    sourceCount: row.source_count,
    edgeIds: row.edge_ids,
    factIds: row.fact_ids,
    sourceIds: row.source_ids
  }));
}
