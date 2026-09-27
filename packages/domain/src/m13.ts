import {
  placeInputSchema,
  type BurialRecord,
  type Place,
  type PlaceInput,
  type PlaceRecord,
} from "@phan/contracts";

export type M13ViewerScope = "public" | "members" | "restricted";

export type PublicPlaceProjection = {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly kind: Place["kind"];
  readonly addressText: string | null;
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | null;
};

export type PublicBurialProjection = {
  readonly id: string;
  readonly version: number;
  readonly personId: string;
  readonly placeId: string;
  readonly locator: string | null;
  readonly sourceId: string | null;
};

const scopeRank: Record<M13ViewerScope, number> = {
  public: 0,
  members: 1,
  restricted: 2,
};

export function canReadM13Visibility(required: M13ViewerScope, viewer: M13ViewerScope): boolean {
  return scopeRank[viewer] >= scopeRank[required];
}

export function parsePlaceInput(input: unknown): PlaceInput | null {
  const result = placeInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function projectPlace(place: PlaceRecord, viewer: M13ViewerScope): PublicPlaceProjection | null {
  if (!canReadM13Visibility(place.visibility, viewer)) return null;

  const coordinates = typeof place.latitude === "number"
    && typeof place.longitude === "number"
    && canReadM13Visibility(place.coordinateVisibility, viewer)
    ? { latitude: place.latitude, longitude: place.longitude }
    : null;

  return {
    id: place.id,
    version: place.version,
    name: place.name,
    kind: place.kind,
    addressText: place.addressText ?? null,
    coordinates,
  };
}

export function projectBurialRecord(
  burial: BurialRecord,
  viewer: M13ViewerScope,
): PublicBurialProjection | null {
  if (!canReadM13Visibility(burial.visibility, viewer)) return null;
  return {
    id: burial.id,
    version: burial.version,
    personId: burial.personId,
    placeId: burial.placeId,
    locator: burial.locator ?? null,
    sourceId: burial.sourceId ?? null,
  };
}

export function hasCompletePlaceCoordinates(place: Pick<Place, "latitude" | "longitude">): boolean {
  return typeof place.latitude === "number" && typeof place.longitude === "number";
}

export function hasBurialEvidence(burial: Pick<BurialRecord, "locator" | "sourceId">): boolean {
  return burial.locator != null || burial.sourceId != null;
}