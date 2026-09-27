import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildNoIndexContentSeo } from "@phan/domain";

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

export function generateMetadata(): Metadata {
  return buildNoIndexContentSeo(appUrl(), "/tin-ho");
}

export default function NewsArticlePage() {
  notFound();
}
