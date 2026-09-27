import { describe, expect, it } from "vitest";
import { burialInputSchema, explicitExternalMapLinkRequestSchema, placeInputSchema, placeSchema } from "./index";

const ids = {
  id: "a3700000-0000-4000-8000-000000000001",
  personId: "a3700000-0000-4000-8000-000000000002",
  placeId: "a3700000-0000-4000-8000-000000000003",
  sourceId: "a3700000-0000-4000-8000-000000000004",
};

describe("M13 place and burial contracts", () => {
  it("accepts place text without coordinates", () => {
    expect(placeInputSchema.parse({
      name: "Khu minh họa",
      kind: "cemetery",
      addressText: "Địa chỉ không phải nhà riêng",
      visibility: "members",
      coordinateVisibility: "restricted",
    })).toMatchObject({ name: "Khu minh họa", addressText: "Địa chỉ không phải nhà riêng" });
  });

  it("rejects a half-specified coordinate pair", () => {
    expect(placeInputSchema.safeParse({
      name: "Khu minh họa",
      kind: "cemetery",
      latitude: 10,
      visibility: "members",
      coordinateVisibility: "restricted",
    }).success).toBe(false);
  });

  it("requires complete persisted place identity", () => {
    expect(placeSchema.safeParse({
      id: ids.id,
      version: 1,
      name: "Khu minh họa",
      kind: "cemetery",
      addressText: null,
      latitude: null,
      longitude: null,
      visibility: "members",
      coordinateVisibility: "restricted",
    }).success).toBe(true);
  });

  it("keeps burial locator and source independently optional", () => {
    expect(burialInputSchema.safeParse({ personId: ids.personId, placeId: ids.placeId, visibility: "restricted" }).success).toBe(true);
    expect(burialInputSchema.safeParse({ personId: ids.personId, placeId: ids.placeId, locator: "Lô A", sourceId: ids.sourceId, visibility: "members" }).success).toBe(true);
  });
});
describe("M13 explicit external map link contract", () => {
  it("accepts only a confirmed place-id/provider request", () => {
    expect(explicitExternalMapLinkRequestSchema.safeParse({ placeId: ids.placeId, provider: "google_maps", confirmed: true }).success).toBe(true);
    expect(explicitExternalMapLinkRequestSchema.safeParse({ placeId: ids.placeId, provider: "google_maps", confirmed: false }).success).toBe(false);
  });
});