import { describe, expect, it } from "vitest";
import { emptyPersonSearchFilters, personSearchHref, readPersonSearchState, validSearchBirthYear } from "./search-state";

describe("person search URL state", () => {
  it("restores an accented query and applied filters from a reloaded or Back URL", () => {
    const state = { query: "Phan Đức ", branchId: "4c4b04f5-db79-536c-b681-fa55ee77917e", lifeStatus: "deceased" as const, birthYear: "1870" };
    const url = new URL(personSearchHref(state), "http://local.invalid");
    expect(readPersonSearchState(url.searchParams)).toEqual(state);
    expect(url.searchParams.get("q")).toBe("Phan Đức ");
  });

  it("clears only applied filters and preserves the person's typed name", () => {
    const current = readPersonSearchState(new URLSearchParams("q=Phan+An&branchId=chi-a&lifeStatus=unknown&birthYear=1900"));
    const href = personSearchHref({ ...current, ...emptyPersonSearchFilters });
    const restored = readPersonSearchState(new URL(href, "http://local.invalid").searchParams);
    expect(restored).toEqual({ query: "Phan An", ...emptyPersonSearchFilters });
    expect(href).not.toContain("branchId");
    expect(href).not.toContain("lifeStatus");
    expect(href).not.toContain("birthYear");
  });

  it("keeps query text out of URL syntax and rejects unsupported life-state values", () => {
    const href = personSearchHref({ query: "An & q=khác #?", ...emptyPersonSearchFilters });
    const params = new URL(href, "http://local.invalid").searchParams;
    expect(params.get("q")).toBe("An & q=khác #?");
    expect([...params.keys()]).toEqual(["q"]);
    expect(readPersonSearchState(new URLSearchParams("lifeStatus=unrecognized")).lifeStatus).toBe("");
  });

  it.each(["", "0", "1870", "-5000", "5000"])("accepts supported birth-year filter %j", (value) => {
    expect(validSearchBirthYear(value)).toBe(true);
  });

  it.each(["1870.5", "1e3", "5001", "-5001", "abc", " "])("does not apply invalid birth-year filter %j", (value) => {
    expect(validSearchBirthYear(value)).toBe(false);
  });
});
