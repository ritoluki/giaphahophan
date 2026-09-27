import { describe, expect, it } from "vitest";
import {
  canReadM13Visibility,
  hasBurialEvidence,
  hasCompletePlaceCoordinates,
  parsePlaceInput,
  projectBurialRecord,
  projectPlace,
} from "./m13";

const place = {
  id: "a3000000-0000-4000-8000-000000000001",
  version: 1,
  name: "Nhà thờ minh họa",
  kind: "temple" as const,
  addressText: "Địa chỉ minh họa, không phải địa chỉ người sống",
  latitude: 10.1234567,
  longitude: 106.1234567,
  visibility: "public" as const,
  coordinateVisibility: "restricted" as const,
};

const burial = {
  id: "a3000000-0000-4000-8000-000000000002",
  version: 1,
  personId: "a3000000-0000-4000-8000-000000000003",
  placeId: place.id,
  locator: "Khu minh họa · Lô A",
  sourceId: "a3000000-0000-4000-8000-000000000004",
  visibility: "members" as const,
};

describe("M13 place and burial boundaries", () => {
  it("orders visibility scopes and requires coordinate pairs", () => {
    expect(canReadM13Visibility("public", "public")).toBe(true);
    expect(canReadM13Visibility("members", "public")).toBe(false);
    expect(canReadM13Visibility("restricted", "members")).toBe(false);
    expect(parsePlaceInput({ ...place, longitude: null })).toBeNull();
    expect(parsePlaceInput({ ...place, latitude: 91 })).toBeNull();
  });

  it("keeps coordinates separately restricted from place text", () => {
    const publicProjection = projectPlace(place, "public");
    expect(publicProjection).toMatchObject({
      name: place.name,
      addressText: place.addressText,
      coordinates: null,
    });
    expect(projectPlace(place, "restricted")?.coordinates).toEqual({
      latitude: place.latitude,
      longitude: place.longitude,
    });
  });

  it("fails closed for a restricted place and burial record", () => {
    expect(projectPlace({ ...place, visibility: "restricted" }, "members")).toBeNull();
    expect(projectBurialRecord(burial, "public")).toBeNull();
    expect(projectBurialRecord(burial, "members")?.locator).toBe(burial.locator);
  });

  it("models burial evidence independently from a person's home address", () => {
    expect(hasCompletePlaceCoordinates(place)).toBe(true);
    expect(hasBurialEvidence(burial)).toBe(true);
    expect(hasBurialEvidence({ locator: null, sourceId: null })).toBe(false);
    expect(JSON.stringify(burial)).not.toContain("homeAddress");
  });
});