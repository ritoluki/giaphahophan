import type { PersonSearchResult, PersonSummary } from "@phan/contracts";
import { normalizeNameSearch } from "./index";

export type SearchablePerson = PersonSummary & {
  readonly names?: ReadonlyArray<{
    readonly name: string;
    readonly kind: "birth" | "preferred" | "alias" | "religious" | "other";
  }>;
};

export function searchPeople(people: ReadonlyArray<SearchablePerson>, query: string, limit = 20): PersonSearchResult[] {
  const normalizedQuery = normalizeNameSearch(query);
  if (normalizedQuery.length < 2) return [];

  return people
    .map((person) => {
      const names = person.names ?? [];
      const matchedNames = names.filter((name) => normalizeNameSearch(name.name).includes(normalizedQuery));
      const matchesCanonical = normalizeNameSearch(person.displayName).includes(normalizedQuery);
      const matchesCode = normalizeNameSearch(person.code).includes(normalizedQuery);
      if (!matchesCanonical && !matchesCode && matchedNames.length === 0) return null;
      const result: PersonSearchResult = {
        id: person.id,
        version: person.version,
        code: person.code,
        displayName: person.displayName,
        lifeStatus: person.lifeStatus,
        isDemo: person.isDemo,
        matchedNames: matchedNames.map(({ name, kind }) => ({ name, kind })),
        ...(person.primaryBranchId !== undefined ? { primaryBranchId: person.primaryBranchId } : {}),
        ...(person.yearLabel !== undefined ? { yearLabel: person.yearLabel } : {}),
        ...(person.portraitAssetId !== undefined ? { portraitAssetId: person.portraitAssetId } : {})
      };
      return result;
    })
    .filter((person): person is PersonSearchResult => person !== null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "vi") || left.id.localeCompare(right.id))
    .slice(0, limit);
}