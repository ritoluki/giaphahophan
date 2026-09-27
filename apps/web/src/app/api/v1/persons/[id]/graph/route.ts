import { graphProjectionSchema, graphQuerySchema, personProjectionSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = personProjectionSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_PERSON_ID", message: "Person id must be a UUID" }, 400);

  const rawQuery = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsedQuery = graphQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) return apiJson({ code: "INVALID_GRAPH_QUERY", message: "Graph direction, depth or node limit is invalid" }, 400);

  const client = await createRequestSupabaseClient();
  const user = await getVerifiedUser(client);
  if (!user && parsedQuery.data.direction !== "roots") {
    return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required for this graph projection" }, 401);
  }

  const { data, error } = await client.schema("api").rpc("person_graph", {
    p_person_id: parsedId.data,
    p_direction: parsedQuery.data.direction,
    p_depth: parsedQuery.data.depth,
    p_max_nodes: parsedQuery.data.maxNodes
  });

  if (error) return apiJson({ code: "GRAPH_LOOKUP_FAILED", message: "Authorized graph projection is unavailable" }, rpcErrorStatus(error.code));
  try {
    return apiJson(graphProjectionSchema.parse(data));
  } catch {
    return apiJson({ code: "GRAPH_PROJECTION_INVALID", message: "Graph projection did not match the public contract" }, 502);
  }
}
