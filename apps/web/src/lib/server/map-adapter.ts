import { mapAdapterConfigSchema, type MapAdapterConfig } from "@phan/contracts";

const disabledMapAdapterConfig: MapAdapterConfig = {
  enabled: false,
  h2Approved: false,
  provider: null,
  requestsPerMinute: 30,
  requestsPerDay: 1000,
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Server-only map configuration. H2 approval and authorization are never client flags. */
export function readServerMapAdapterConfig(
  source: Readonly<Record<string, string | undefined>> = process.env,
): MapAdapterConfig {
  const candidate = {
    enabled: source.MAP_PROVIDER_ENABLED === "true",
    h2Approved: source.MAP_PROVIDER_H2_APPROVED === "true",
    provider: source.MAP_PROVIDER === "google_maps" || source.MAP_PROVIDER === "openstreetmap"
      ? source.MAP_PROVIDER
      : null,
    requestsPerMinute: positiveInteger(source.MAP_PROVIDER_REQUESTS_PER_MINUTE, 30),
    requestsPerDay: positiveInteger(source.MAP_PROVIDER_REQUESTS_PER_DAY, 1000),
  };
  const parsed = mapAdapterConfigSchema.safeParse(candidate);
  return parsed.success ? parsed.data : disabledMapAdapterConfig;
}