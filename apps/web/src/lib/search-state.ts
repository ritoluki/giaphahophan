export type PersonSearchFilters = {
  branchId: string;
  lifeStatus: "" | "living" | "deceased" | "unknown";
  birthYear: string;
};

export type PersonSearchState = PersonSearchFilters & { query: string };

export const emptyPersonSearchFilters: PersonSearchFilters = { branchId: "", lifeStatus: "", birthYear: "" };

export function readPersonSearchState(params: Pick<URLSearchParams, "get">): PersonSearchState {
  const lifeStatus = params.get("lifeStatus");
  return {
    query: params.get("q") ?? "",
    branchId: params.get("branchId") ?? "",
    lifeStatus: lifeStatus === "living" || lifeStatus === "deceased" || lifeStatus === "unknown" ? lifeStatus : "",
    birthYear: params.get("birthYear") ?? ""
  };
}

/** Keep the typed query intact so updating the URL never eats spaces at the caret. */
export function personSearchHref(state: PersonSearchState): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.branchId) params.set("branchId", state.branchId);
  if (state.lifeStatus) params.set("lifeStatus", state.lifeStatus);
  if (state.birthYear) params.set("birthYear", state.birthYear);
  return `/tra-cuu${params.size ? `?${params.toString()}` : ""}`;
}

export function validSearchBirthYear(value: string): boolean {
  return value === "" || (/^-?\d+$/.test(value) && Number.isInteger(Number(value)) && Number(value) >= -5000 && Number(value) <= 5000);
}
