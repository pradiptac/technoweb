import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { CtaBand } from "@/components/ui/cta-band";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { SearchForm } from "@/components/forms/search-form";
import { TenderTiles } from "@/components/tenders/tender-tiles";
import { publicApi } from "@/lib/api";
import { brandName } from "@/lib/brand";
import { isPrerendering } from "@/lib/build-phase";
import { JsonLd, listingMetadata } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import type { TenderCategory, TenderSummary } from "@/types/tenders";
import type { Paginated } from "@/types/api";

/*
 * Tenders (0.174.0, docs/tenders.md).
 *
 * **Dynamic, because it reads `searchParams`** — a category, a search, a
 * page, and which window. That is the downloads centre's shape rather than
 * the events index's, which reads none in order to stay ISR-cached.
 *
 * Being rendered per request is also what keeps the states honest here: the
 * chip on each tile is the state the API computed, at most a minute old, so
 * no island is needed on this page. The notice's own page is cached and has
 * one.
 */

type SearchParams = { q?: string; category?: string; when?: string; page?: string };

const WINDOWS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;

/** A category, a search or the archive is a filtered view: `noindex, follow`. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return listingMetadata({
    title: "Tenders",
    description: `Open tenders from ${brandName()} — what we are inviting bids for, the closing dates and the documents.`,
    path: "/tenders",
    searchParams: await searchParams,
    filters: ["q", "category", "when"],
  });
}

export default async function TendersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();
  const category = (sp.category ?? "").trim();
  const when = WINDOWS.some((w) => w.value === sp.when) ? (sp.when as string) : "open";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const query = new URLSearchParams();
  if (term) query.set("q", term);
  if (category) query.set("category", category);
  if (when !== "open") query.set("when", when);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();

  let tenders: Paginated<TenderSummary> | null = null;
  let categories: TenderCategory[] = [];
  let failed = false;

  try {
    // Together; the categories are the lesser of the two and fail quietly.
    const [list, filters] = await Promise.all([
      publicApi.tenders(qs ? `?${qs}` : "", !term),
      publicApi.tenderCategories().then((r) => r.data).catch(() => [] as TenderCategory[]),
    ]);
    tenders = list;
    categories = filters;
  } catch (error) {
    // A build that cannot reach the API fails rather than baking "we could
    // not load the tenders" into HTML for a crawler.
    if (isPrerendering) throw error;
    failed = true;
  }

  const rows = tenders?.data ?? [];
  const filtered = Boolean(term || category || when !== "open");

  const pageParams: Record<string, string> = {};
  if (term) pageParams.q = term;
  if (category) pageParams.category = category;
  if (when !== "open") pageParams.when = when;

  const href = (next: Partial<SearchParams>) => {
    const params = new URLSearchParams();
    const merged = { q: term, category, when, ...next };
    if (merged.q) params.set("q", merged.q);
    if (merged.category) params.set("category", merged.category);
    if (merged.when && merged.when !== "open") params.set("when", merged.when);
    const s = params.toString();

    return s ? `/tenders?${s}` : "/tenders";
  };

  const pill = (active: boolean) => cn(
    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-13-5 font-semibold transition-colors duration-(--duration-base)",
    active
      ? "border-brand-600 bg-brand-600 text-brand-on"
      : "border-line-strong text-ink-2 hover:border-brand-ink hover:text-brand-ink",
  );

  return (
    <>
      <PageHero
        section="company"
        kicker="Tenders"
        title="Tenders and invitations to bid"
        lede={`What ${brandName()} is currently inviting bids for — the scope, the closing date and the documents. Bids are submitted the way each notice says; nothing is submitted through this page.`}
        crumbs={[{ name: "Tenders", path: "/tenders" }]}
      >
        <Suspense fallback={null}>
          <SearchForm
            action="/tenders"
            label="Search the tenders"
            placeholder="A tender number or a few words…"
            defaultValue={term}
            className="h-11 min-w-0 flex-1 py-0 sm:max-w-[420px]"
          />
        </Suspense>
      </PageHero>

      <Container data-aos="fade-up" className="section-y">
        <nav aria-label="Filter the tenders" className="mb-8 grid gap-3">
          <ul className="flex flex-wrap gap-2">
            {WINDOWS.map((window) => (
              <li key={window.value}>
                <Link
                  href={href({ when: window.value })}
                  className={pill(window.value === when)}
                  aria-current={window.value === when ? "page" : undefined}
                >
                  {window.label}
                </Link>
              </li>
            ))}
          </ul>

          {categories.length > 1 && (
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link href={href({ category: "" })} className={pill(!category)} aria-current={!category ? "page" : undefined}>
                  Every category
                </Link>
              </li>
              {categories.map((row) => (
                <li key={row.id}>
                  <Link
                    href={href({ category: row.slug })}
                    className={pill(row.slug === category)}
                    aria-current={row.slug === category ? "page" : undefined}
                  >
                    {row.name}
                    <span className={cn("text-12 font-normal", row.slug === category ? "text-brand-on" : "text-muted")}>
                      {row.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {failed ? (
          <ErrorState title="We could not load the tenders">
            Something is wrong at our end. Try again shortly, or get in touch and we will send you the notice.
          </ErrorState>
        ) : rows.length === 0 ? (
          <EmptyState
            illustration={term ? "search" : "document"}
            title={
              term
                ? `Nothing found for “${term}”`
                : when === "closed"
                  ? "No closed tenders yet"
                  : category
                    ? "Nothing open in this category"
                    : "Nothing open at the moment"
            }
            action={
              filtered
                ? <ButtonLink href="/tenders" variant="secondary">See the open tenders</ButtonLink>
                : <ButtonLink href="/contact?subject=Tenders" variant="secondary">Ask to be told about new tenders</ButtonLink>
            }
          >
            {term
              ? "Try the tender number on its own, or fewer words."
              : "Tenders are posted here as they open. If you supply what we buy, get in touch and we will keep you in mind."}
          </EmptyState>
        ) : (
          <>
            <h2 className="sr-only">
              {when === "closed" ? "Closed tenders" : when === "all" ? "Every tender" : "Open tenders"}
            </h2>
            <TenderTiles tenders={rows} titleAs="h3" />
            {tenders && (
              <div className="mt-10">
                <Pagination meta={tenders.meta} basePath="/tenders" params={pageParams} />
              </div>
            )}
          </>
        )}
      </Container>

      {/* The open ones only: a list a crawler reads should not advertise a
          deadline that has passed. */}
      {rows.some((t) => !t.closed) && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Open tenders",
            itemListElement: rows
              .filter((t) => !t.closed)
              .map((tender, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: tender.title,
                url: `${siteUrl()}/tenders/${tender.slug}`,
              })),
          }}
        />
      )}

      <CtaBand />
    </>
  );
}
