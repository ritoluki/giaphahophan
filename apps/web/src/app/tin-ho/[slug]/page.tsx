import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildNoIndexContentSeo } from "@phan/domain";
import { NewsArticle } from "../../../modules/m12/news-reader";
import { getDemoNewsPost, getDemoNewsPosts } from "../../../modules/m12/demo-content";

type PageProps = { params: Promise<{ slug: string }> };

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

export function generateStaticParams() {
  return getDemoNewsPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!getDemoNewsPost(slug)) return buildNoIndexContentSeo(appUrl(), "/tin-ho");
  return buildNoIndexContentSeo(appUrl(), "/tin-ho");
}

export default async function NewsArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const post = getDemoNewsPost(slug);
  if (!post) notFound();
  return <NewsArticle post={post} />;
}
