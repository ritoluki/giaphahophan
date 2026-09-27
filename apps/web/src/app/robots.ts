import type { MetadataRoute } from "next";

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

export default function robots(): MetadataRoute.Robots {
  const indexable = process.env.APP_ENV === "production" && process.env.DATA_MODE === "real";
  return {
    rules: indexable
      ? { userAgent: "*", allow: "/" }
      : { userAgent: "*", disallow: "/" },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
