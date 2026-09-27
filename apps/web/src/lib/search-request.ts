import { personSearchResultSchema } from "@phan/contracts";
import type { PersonSearchResult } from "@phan/contracts";

type SearchFilters = {
  query: string;
  branchId?: string;
  lifeStatus?: string;
  birthYear?: string;
};

export type LatestSearchRequest = {
  signal: AbortSignal;
  isCurrent: () => boolean;
};

export function createLatestSearchRequestCoordinator() {
  let sequence = 0;
  let activeController: AbortController | null = null;

  return {
    begin(): LatestSearchRequest {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const requestSequence = ++sequence;
      return {
        signal: controller.signal,
        isCurrent: () => requestSequence === sequence && !controller.signal.aborted
      };
    },
    cancel() {
      sequence += 1;
      activeController?.abort();
      activeController = null;
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchPersonSearch(filters: SearchFilters, signal: AbortSignal): Promise<PersonSearchResult[]> {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.lifeStatus) params.set("lifeStatus", filters.lifeStatus);
  if (filters.birthYear) params.set("birthYear", filters.birthYear);
  const response = await fetch(`/api/v1/persons?${params.toString()}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("SEARCH_UNAVAILABLE");
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.data)) throw new Error("SEARCH_INVALID_RESPONSE");
  return body.data.map((row) => {
    const parsed = personSearchResultSchema.parse(row);
    return {
      id: parsed.id,
      version: parsed.version,
      code: parsed.code,
      displayName: parsed.displayName,
      lifeStatus: parsed.lifeStatus,
      isDemo: parsed.isDemo,
      matchedNames: parsed.matchedNames,
      ...(parsed.primaryBranchId !== undefined ? { primaryBranchId: parsed.primaryBranchId } : {}),
      ...(parsed.yearLabel !== undefined ? { yearLabel: parsed.yearLabel } : {}),
      ...(parsed.portraitAssetId !== undefined ? { portraitAssetId: parsed.portraitAssetId } : {})
    } satisfies PersonSearchResult;
  });
}
