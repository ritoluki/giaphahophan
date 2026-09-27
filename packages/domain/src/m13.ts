import {
  explicitExternalMapLinkRequestSchema,
  placeDirectionsInputSchema,
  placeInputSchema,
  type BurialRecord,
  type Place,
  type PlaceInput,
  type ExternalMapProvider,
  type PlaceDirections,
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

export type PublicPlaceDirections = {
  readonly id: string;
  readonly version: number;
  readonly placeId: string;
  readonly instructionText: string;
  readonly sourceId: string | null;
  readonly visibility: M13ViewerScope;
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
export function buildExplicitExternalMapLink(
  place: PlaceRecord,
  viewer: M13ViewerScope,
  provider: ExternalMapProvider,
  confirmed: boolean,
): string | null {
  if (!confirmed || !explicitExternalMapLinkRequestSchema.safeParse({ placeId: place.id, provider, confirmed: true }).success) return null;
  const projection = projectPlace(place, viewer);
  if (!projection?.coordinates) return null;
  const { latitude, longitude } = projection.coordinates;
  if (provider === "google_maps") {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  }
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(latitude))}&mlon=${encodeURIComponent(String(longitude))}#map=18/${encodeURIComponent(String(latitude))}/${encodeURIComponent(String(longitude))}`;
}
export function parsePlaceDirectionsInput(input: unknown) {
  const result = placeDirectionsInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function projectPlaceDirections(
  directions: PlaceDirections,
  viewer: M13ViewerScope,
): PublicPlaceDirections | null {
  if (!canReadM13Visibility(directions.visibility, viewer)) return null;
  return {
    id: directions.id,
    version: directions.version,
    placeId: directions.placeId,
    instructionText: directions.instructionText,
    sourceId: directions.sourceId,
    visibility: directions.visibility,
  };
}