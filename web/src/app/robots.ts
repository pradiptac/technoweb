import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/**
 * What a crawler may fetch.
 *
 * Two things this file decides, and the second is a decision rather than a
 * default (`docs/seo-audit-2026-09-18.md`, F3).
 *
 * **Crawl budget.** Everything under `noindex` is listed here as well, so a
 * crawler does not have to fetch the console's sign-in screen, an empty
 * basket, the checkout, an order page or a search result to learn it is not
 * wanted — `noindex` is read after the fetch, `Disallow` before it. The API
 * and the theme preview were always here; the console, the shop's private
 * pages and the search were not.
 *
 * **Assistants.** The AI crawlers — OpenAI's, Anthropic's, Perplexity's,
 * Google's training fetch, Common Crawl, Apple's — are allowed the same
 * pages as everyone else, and named so that it is plainly a choice. This is
 * a business that wants to be the source an assistant cites for "who
 * installs a firewall in Kolkata", and a company that is invisible to the
 * models is one nobody is told about; the same `Disallow` list keeps them
 * out of the private pages. Blocking training while allowing search
 * (`Google-Extended` off, `Googlebot` on) is the one distinction worth
 * making if the client asks for it later — it is one line here.
 */
const PRIVATE = [
  "/admin/",
  "/portal/",
  "/api/",
  "/theme-preview/",
  "/cart",
  "/store/basket/",
  "/checkout",
  "/order/",
  "/search",
  "/embed/",
  "/products/compare",
  "/newsletter/unsubscribe/",
  // A guest's own visit request, opened by a token in a cookie (docs/visits.md).
  // `/book-a-visit` itself is public and stays allowed.
  "/visit/",
];

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
