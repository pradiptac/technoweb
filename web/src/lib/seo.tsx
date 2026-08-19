import type { Metadata } from "next";
import type { Seo } from "@/types/api";

export const SITE = {
  name: "Technoware",
  legalName: "Technoware",
  description:
    "Technoware designs, deploys and supports enterprise networks, servers, storage and security infrastructure — backed by a real engineering support desk.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.technoware.in",
  locale: "en_IN",
  telephone: "+91 98765 43210",
  email: "support@technoware.in",
} as const;

/**
 * Build page metadata: generate sensible defaults automatically, then let the
 * admin's SEO Manager override any individual field. Never require an editor to
 * fill in every box for a page to be indexable.
 */
export function buildMetadata(input: {
  title: string;
  description?: string | null;
  path?: string;
  image?: string | null;
  seo?: Seo | null;
  type?: "website" | "article";
}): Metadata {
  const seo = input.seo ?? null;
  const title = seo?.title || input.title;
  const description = seo?.description || input.description || SITE.description;
  const path = input.path ?? "/";
  const canonical = seo?.canonical_url || `${SITE.url}${path}`;
  const image = seo?.og_image || input.image || `${SITE.url}/og-default.png`;

  const robots = seo?.robots;

  return {
    title,
    description,
    alternates: { canonical },
    ...(robots ? { robots } : {}),
    openGraph: {
      type: input.type ?? "website",
      title: seo?.og_title || title,
      description: seo?.og_description || description,
      url: canonical,
      siteName: SITE.name,
      locale: SITE.locale,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo?.og_title || title,
      description: seo?.og_description || description,
      images: [image],
    },
  };
}

type Json = Record<string, unknown>;

export const jsonLd = {
  organization: (): Json => ({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: SITE.telephone,
      email: SITE.email,
      contactType: "technical support",
      availableLanguage: ["en"],
    },
  }),

  website: (): Json => ({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
  }),

  breadcrumbs: (crumbs: { name: string; path: string }[]): Json => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE.url}${c.path}`,
    })),
  }),

  service: (s: { title: string; summary: string | null; slug: string }): Json => ({
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.title,
    description: s.summary ?? undefined,
    url: `${SITE.url}/solutions/${s.slug}`,
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
  }),

  product: (p: { name: string; short_description: string | null; slug: string; brand: { name: string } | null }): Json => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.short_description ?? undefined,
    url: `${SITE.url}/products/${p.slug}`,
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand.name } } : {}),
  }),

  faqPage: (faqs: { question: string; answer: string }[]): Json => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  }),
};

/** Render a JSON-LD block. Use inside a Server Component. */
export function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
