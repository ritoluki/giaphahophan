import { describe, expect, it } from "vitest";
import { burialInputSchema, explicitExternalMapLinkRequestSchema, mapAdapterConfigSchema, mapAdapterDecisionSchema, mediaLinkInputSchema, placeDirectionsInputSchema, placeInputSchema, placeSchema } from "./index";

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
describe("M13 place media target", () => {
  it("allows a place media target and keeps exactly-one semantics", () => {
    expect(mediaLinkInputSchema.safeParse({ placeId: ids.placeId, caption: "Ảnh khu mộ minh họa" }).success).toBe(true);
    expect(mediaLinkInputSchema.safeParse({ placeId: ids.placeId, personId: ids.personId }).success).toBe(false);
  });

  it("validates directions independently from provider links", () => {
    expect(placeDirectionsInputSchema.safeParse({ placeId: ids.placeId, instructionText: "Lối vào minh họa", visibility: "members" }).success).toBe(true);
  });
});
describe("M13 map adapter gate contracts", () => {
  it("requires an explicit H2-approved server config and bounded quotas", () => {
    expect(mapAdapterConfigSchema.safeParse({ enabled: false, h2Approved: false, provider: null, requestsPerMinute: 30, requestsPerDay: 1000 }).success).toBe(true);
    expect(mapAdapterConfigSchema.safeParse({ enabled: true, h2Approved: true, provider: "google_maps", requestsPerMinute: 30, requestsPerDay: 29 }).success).toBe(false);
  });

  it("validates a redacted decision DTO", () => {
    expect(mapAdapterDecisionSchema.safeParse({ allowed: false, code: "approval_required", provider: null, url: null, retryAfterSeconds: null }).success).toBe(true);
    expect(mapAdapterDecisionSchema.safeParse({ allowed: true, code: "allowed", provider: "google_maps", url: "https://www.google.com/maps/", retryAfterSeconds: null }).success).toBe(true);
  });
});
