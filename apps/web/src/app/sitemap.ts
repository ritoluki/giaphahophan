import type { MetadataRoute } from "next";
import { buildPublicSitemap } from "@phan/domain";

function appUrl(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) return "http://localhost:3100";
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return "http://localhost:3100";
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const indexable = process.env.APP_ENV === "production" && process.env.DATA_MODE === "real";
  if (!indexable) return [];

  const baseUrl = appUrl();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: new URL("/", baseUrl).toString() },
    { url: new URL("/gioi-thieu", baseUrl).toString() },
    { url: new URL("/tin-ho", baseUrl).toString() },
  ];
  return [...staticEntries, ...buildPublicSitemap([], baseUrl)];
}
