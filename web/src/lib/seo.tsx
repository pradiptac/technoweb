import type { Metadata } from "next";
import type { Seo } from "@/types/api";
import { siteUrl } from "@/lib/site-url";
import { brandName } from "@/lib/brand";

export const SITE = {
  // Getters for the same reason as `url`: the company is the runtime
  // `SITE_NAME` (`lib/brand.ts`), never a literal — each install is sold
  // under its owner's name.
  get name(): string {
    return brandName();
  },
  get legalName(): string {
    return brandName();
  },
  get description(): string {
    return `${brandName()} designs, deploys and supports enterprise networks, servers, storage and security infrastructure — backed by a real engineering support desk.`;
  },
  // A getter: the origin is runtime configuration (`lib/site-url.ts`), and a
  // module-level constant would freeze whatever it was when first imported.
  get url(): string {
    return siteUrl();
  },
  locale: "en_IN",
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
  /**
   * The Open Graph article fields — what a social preview and an aggregator
   * read for the byline and the date. Only read when `type` is `article`;
   * every post, article and case study has the data, and until 2026-09-18
   * none of them sent it (`docs/seo-audit-2026-09-18.md`, F5).
   */
  article?: {
    publishedTime?: string | null;
    modifiedTime?: string | null;
    authors?: (string | null | undefined)[];
    tags?: (string | null | undefined)[];
  };
}): Metadata {
  const seo = input.seo ?? null;
  const title = seo?.title || input.title;
  const description = seo?.description || input.description || SITE.description;
  const path = input.path ?? "/";
  const canonical = seo?.canonical_url || `${SITE.url}${path}`;
  // The generated card at app/opengraph-image.tsx, not a static file. The
  // previous fallback pointed at /og-default.png, which was never added, so
  // every index page advertised a share image that returned a 404 and the
  // preview came out blank.
  const image = seo?.og_image || input.image || `${SITE.url}/opengraph-image`;

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
      ...(input.type === "article" && input.article
        ? {
            ...(input.article.publishedTime ? { publishedTime: input.article.publishedTime } : {}),
            ...(input.article.modifiedTime ? { modifiedTime: input.article.modifiedTime } : {}),
            ...(input.article.authors?.some(Boolean) ? { authors: input.article.authors.filter((a): a is string => Boolean(a)) } : {}),
            ...(input.article.tags?.some(Boolean) ? { tags: input.article.tags.filter((t): t is string => Boolean(t)) } : {}),
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo?.og_title || title,
      description: seo?.og_description || description,
      images: [image],
    },
  };
}

/**
 * Metadata for a listing that pages and filters — `/blog`, `/products`,
 * `/store`, `/knowledge-base` and the category listings.
 *
 * Every one of them used to export a static `metadata`, so `/blog?page=2`
 * carried the canonical of `/blog`: a claim that page two is a duplicate of
 * page one, which is exactly wrong. Google dropped `rel=prev/next` in 2019
 * and asks each page of a series for a **self-referencing canonical**;
 * canonicalising the series onto its first page leaves everything past it
 * reachable through the sitemap alone, and the listing pages themselves
 * consolidate into one (`docs/seo-audit-2026-09-18.md`, F1).
 *
 * So: page two and on gets `?page=N` on its canonical and " — page N" on
 * its title. A **filtered** view — a search term, a brand facet, a month
 * archive — is `noindex, follow`: it is a view of pages that are indexed
 * on their own, with an unbounded key space, and the canonical stays the
 * bare listing so whatever weight it gathers goes there. `sort` is not a
 * filter: it reorders the same set, and an unrecognised value falls back
 * to the default order, so it is left off the canonical and left indexable
 * rather than minting a `noindex` variant per ordering.
 *
 * A per-record `seo` override still wins where a listing has one (a
 * category's own title), and the caller's `extra` is spread last for the
 * blog's feed link.
 */
export function listingMetadata(input: {
  title: string;
  description?: string | null;
  path: string;
  searchParams: Record<string, string | undefined>;
  /** Query keys that make a filtered view of the listing, never indexed on their own. */
  filters?: readonly string[];
  seo?: Seo | null;
  image?: string | null;
}): Metadata {
  const { searchParams: sp, filters = ["q"] } = input;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const filtered = filters.some((k) => typeof sp[k] === "string" && sp[k] !== "");

  const base = buildMetadata({
    title: page > 1 ? `${input.title} — page ${page}` : input.title,
    description: input.description,
    path: input.path,
    seo: input.seo,
    image: input.image,
  });
  if (filtered) {
    // A filtered view keeps the bare canonical the base built and is not indexed.
    return { ...base, robots: input.seo?.robots || "noindex, follow" };
  }
  if (page > 1) {
    const canonical = `${input.seo?.canonical_url || `${SITE.url}${input.path}`}?page=${page}`;
    return {
      ...base,
      alternates: { ...base.alternates, canonical },
      openGraph: { ...base.openGraph, url: canonical },
    };
  }
  return base;
}

type Json = Record<string, unknown>;

const SOCIAL_KEYS = ["social_linkedin", "social_x", "social_facebook", "social_instagram", "social_youtube", "social_reddit"] as const;

/** The social profile URLs an install has filled in — `Organization.sameAs`. */
function sameAs(settings: Record<string, string | undefined>): string[] {
  return SOCIAL_KEYS.map((k) => settings[k]?.trim()).filter((v): v is string => Boolean(v && /^https?:\/\//.test(v)));
}

/**
 * A list of names the API publishes as one JSON-encoded string on the
 * public `/settings` map — `organization_knows_about` (published solution
 * titles) and `organization_area_served` (active locations' names), absent
 * when empty (`docs/aeo-geo-samples.md`). Decoded the way `site_theme_options`
 * is: a row that does not parse, or is not a list of strings, is nothing,
 * and nothing is said. Never a literal list here — the catalogue is the API's.
 */
function jsonNames(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
      : [];
  } catch {
    return [];
  }
}

/**
 * A `PostalAddress` from the one line-broken address setting. The last
 * line that ends in a six-digit PIN gives the locality and the postcode;
 * everything above it is the street address; the country is India, where
 * every PIN is. A last line without a PIN leaves the whole thing as the
 * street address, which is true if less useful.
 */
function postalAddress(address: string): Json {
  const lines = address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  const m = /^(.*?)[\s,]*(\d{6})$/.exec(last);
  if (m && lines.length > 1) {
    return {
      "@type": "PostalAddress",
      streetAddress: lines.slice(0, -1).join(", "),
      addressLocality: m[1].replace(/,\s*$/, ""),
      postalCode: m[2],
      addressCountry: "IN",
    };
  }
  return { "@type": "PostalAddress", streetAddress: lines.join(", "), addressCountry: "IN" };
}

/**
 * The JSON-LD this file still owns.
 *
 * Only the blocks that are about the *site* rather than about a record:
 * Organization, WebSite and the breadcrumb trail, which is built from the crumbs
 * a page already passes to `PageHero`. Everything keyed to a record — Product,
 * Service, Article, FAQPage on a record, LocalBusiness — is built by
 * `App\Support\StructuredData` and arrives on the resource as `schema`.
 *
 * The `product` and `service` builders that used to live here were deleted
 * rather than left unused: a second definition of a Product graph is not dead
 * code, it is a trap for whoever needs one next and reaches for whichever they
 * find first.
 */
export const jsonLd = {
  /**
   * Takes the settings the layout already read, so the structured data quotes
   * the same phone number, address and company name the page does. Search
   * results showing a number the site no longer uses is the failure mode this
   * avoids. Falls back to the static constants when nothing is configured.
   */
   /*
    One entity, named once. `@id` is what lets every `publisher`,
    `provider` and `parentOrganization` node the API builds point at this
    node instead of repeating a name — and what lets an assistant resolve
    "Technoware" to one thing rather than a string that appears on forty
    pages. `sameAs` is the social profiles from Settings → Social, which is
    the one place those links do SEO work; WhatsApp is a chat link, not a
    profile, and stays out. The address is one free-text setting, so the
    PIN and the locality are read off its last line where they can be
    ("Andheri East, Mumbai 400093") and the rest stays the street address;
    nothing is invented where the line does not parse.
    (`docs/seo-audit-2026-09-18.md`, F4.)
  */
  organization: (settings: Record<string, string | undefined> = {}): Json => ({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: settings.company_name || SITE.name,
    url: SITE.url,
    description: settings.tagline || SITE.description,
    ...(settings.logo_url ? { logo: { "@type": "ImageObject", url: settings.logo_url } } : {}),
    ...(settings.address ? { address: postalAddress(settings.address) } : {}),
    ...(sameAs(settings).length ? { sameAs: sameAs(settings) } : {}),
    // What the company knows and where it works, so an assistant resolving
    // the entity has the subjects and the places beside the name. Both are
    // derived server-side from the catalogue (`docs/aeo-geo-contract.md` §4)
    // and arrive as JSON strings; nothing is typed here.
    ...(jsonNames(settings.organization_knows_about).length ? { knowsAbout: jsonNames(settings.organization_knows_about) } : {}),
    ...(jsonNames(settings.organization_area_served).length
      ? { areaServed: jsonNames(settings.organization_area_served).map((name) => ({ "@type": "Place", name })) }
      : {}),
    // Only what Settings → Contact holds: no invented number or address.
    ...(settings.phone || settings.support_email
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            ...(settings.phone ? { telephone: settings.phone } : {}),
            ...(settings.support_email ? { email: settings.support_email } : {}),
            contactType: "technical support",
            availableLanguage: ["en"],
          },
        }
      : {}),
  }),

  // No `SearchAction`: Google retired the sitelinks search box in 2024, and
  // `/search` is disallowed to crawlers, so advertising it would name a page
  // they may not fetch.
  website: (): Json => ({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    name: SITE.name,
    url: SITE.url,
    publisher: { "@id": `${SITE.url}/#organization` },
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



  /*
    One caller since 2026-09-21: the landing page view, the one FAQ-bearing
    record the API sends no `faq_schema` for. Every other detail read carries
    the API's own `FAQPage` (over the FAQs and the `question` answer blocks,
    absent under two entries), and `FaqList` emits none — a page must never
    carry two.
  */
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

/**
 * Render a JSON-LD block. Use inside a Server Component.
 *
 * `<` is escaped to its \u003c form because JSON.stringify does not escape it,
 * and this string is written straight into a <script> element. A CMS field
 * containing "</script>" would otherwise close this block and everything after
 * it would be parsed as live markup -- stored XSS on every visitor's page,
 * reachable from any plain-text field that lands in structured data.
 *
 * HtmlSanitiser does not cover this: it only runs over the rich-text fields a
 * request declares, and a product name or page title is a plain string that is
 * correctly escaped by React everywhere except here.
 *
 * \u003c is valid JSON, so parsers still read it as `<` and the structured
 * data is unchanged. Escaping `<` alone is sufficient -- a breakout needs it.
 */
export function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
