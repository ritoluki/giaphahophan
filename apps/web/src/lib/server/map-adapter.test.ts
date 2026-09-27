import { describe, expect, it } from "vitest";
import { readServerMapAdapterConfig } from "./map-adapter";

describe("server map adapter config", () => {
  it("fails closed with no provider or approval configuration", () => {
    expect(readServerMapAdapterConfig({})).toMatchObject({ enabled: false, h2Approved: false, provider: null });
  });

  it("accepts only server-side provider settings and bounded quota values", () => {
    expect(readServerMapAdapterConfig({
      MAP_PROVIDER_ENABLED: "true",
      MAP_PROVIDER_H2_APPROVED: "true",
      MAP_PROVIDER: "openstreetmap",
      MAP_PROVIDER_REQUESTS_PER_MINUTE: "12",
      MAP_PROVIDER_REQUESTS_PER_DAY: "120",
    })).toEqual({ enabled: true, h2Approved: true, provider: "openstreetmap", requestsPerMinute: 12, requestsPerDay: 120 });
    expect(readServerMapAdapterConfig({
      MAP_PROVIDER_ENABLED: "true",
      MAP_PROVIDER_H2_APPROVED: "true",
      MAP_PROVIDER: "unknown-provider",
      MAP_PROVIDER_REQUESTS_PER_MINUTE: "200",
      MAP_PROVIDER_REQUESTS_PER_DAY: "100",
    })).toMatchObject({ enabled: false, provider: null });
  });
});