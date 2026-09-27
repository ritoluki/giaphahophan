import {
  publicContentSeoInputSchema,
  type PublicContentSeoInput,
} from "@phan/contracts";

export type PublicContentProjection = PublicContentSeoInput;

export type PublicContentSeo = {
  readonly title: string;
  readonly description: string;
  readonly alternates: { readonly canonical: string };
  readonly robots: { readonly index: true; readonly follow: true };
  readonly openGraph: {
    readonly title: string;
    readonly description: string;
    readonly type: "article";
    readonly url: string;
    readonly images: readonly { readonly url: string; readonly alt: string }[];
  };
};

export type NoIndexContentSeo = {
  readonly title: string;
  readonly description: string;
  readonly robots: {
    readonly index: false;
    readonly follow: false;
    readonly noarchive: true;
    readonly nosnippet: true;
  };
};

export type PublicSitemapEntry = {
  readonly url: string;
  readonly lastModified: string;
};

function siteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RangeError("public_site_url_invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new RangeError("public_site_url_invalid");
  return url;
}

function absoluteUrl(base: string, path: string): string {
  return new URL(path, siteUrl(base)).toString();
}

export function toPublicContentProjection(input: unknown): PublicContentProjection | null {
  const parsed = publicContentSeoInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function buildPublicContentSeo(
  projection: PublicContentProjection,
  baseUrl: string,
): PublicContentSeo {
  const path = `/tin-ho/${projection.slug}`;
  const url = absoluteUrl(baseUrl, path);
  return {
    title: `${projection.title} · Phan Gia Phả`,
    description: projection.summary,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: projection.title,
      description: projection.summary,
      type: "article",
      url,
      images: projection.cover ? [{ url: projection.cover.url, alt: projection.cover.alt }] : [],
    },
  };
}

export function buildNoIndexContentSeo(
  baseUrl: string,
  path = "/tin-ho",
): NoIndexContentSeo {
  absoluteUrl(baseUrl, path);
  return {
    title: "Nội dung chưa được xuất bản · Phan Gia Phả",
    description: "Nội dung này chưa được phép hiển thị công khai.",
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}

export function buildPublicSitemap(
  entries: readonly PublicContentProjection[],
  baseUrl: string,
): readonly PublicSitemapEntry[] {
  return entries.map((entry) => ({
    url: absoluteUrl(baseUrl, `/tin-ho/${entry.slug}`),
    lastModified: entry.updatedAt,
  }));
}
