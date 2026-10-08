import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { CtaBand } from "@/components/ui/cta-band";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { SearchForm } from "@/components/forms/search-form";
import { DownloadList, downloadRow } from "@/components/downloads/download-list";
import { publicApi } from "@/lib/api";
import { brandName } from "@/lib/brand";
import { listingMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Download, DownloadCategory } from "@/types/downloads";
import type { Paginated } from "@/types/api";

/*
 * The downloads centre (0.131.0, docs/downloads.md).
 *
 * Dynamic, because it reads `searchParams` — a shelf, a search, a page. The
 * unfiltered list and the shelves are cached fetches tagged `downloads`, so
 * a visit costs the API nothing until an editor saves; a search is never
 * cached. No file's address is on this page: every button goes to
 * `/api/downloads/{id}`.
 */

type SearchParams = { q?: string; category?: string; page?: string };

/** A shelf or a search is a filtered view: `noindex, follow`, the bare canonical. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return listingMetadata({
    title: "Downloads",
    description: `Datasheets, drivers, firmware and guides for the hardware ${brandName()} supplies and supports.`,
    path: "/downloads",
    searchParams: await searchParams,
    filters: ["q", "category"],
  });
}

/** Consecutive runs of one shelf, in the order the API sent them — it sorts by shelf. */
function byShelf(downloads: Download[]): { key: string; name: string | null; items: Download[] }[] {
  const groups: { key: string; name: string | null; items: Download[] }[] = [];

  for (const download of downloads) {
    const key = download.category?.slug ?? "";
    const last = groups[groups.length - 1];

    if (last && last.key === key) last.items.push(download);
    else groups.push({ key, name: download.category?.name ?? null, items: [download] });
  }

  return groups;
}

export default async function DownloadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();
  const shelf = (sp.category ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const query = new URLSearchParams();
  if (term) query.set("q", term);
  if (shelf) query.set("category", shelf);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();

  let downloads: Paginated<Download> | null = null;
  let categories: DownloadCategory[] = [];
  let failed = false;

  try {
    // Together; the shelves are the lesser of the two and fail quietly.
    const [list, shelves] = await Promise.all([
      publicApi.downloads(qs ? `?${qs}` : "", !term),
      publicApi.downloadCategories().then((r) => r.data).catch(() => [] as DownloadCategory[]),
    ]);
    downloads = list;
    categories = shelves;
  } catch {
    failed = true;
  }

  const current = categories.find((c) => c.slug === shelf) ?? null;
  const rows = downloads?.data ?? [];
  const total = downloads?.meta.total ?? 0;
  const filtered = Boolean(term || shelf);
  // Shelf headings only when the list spans shelves and nobody is searching.
  const grouped = !filtered && categories.length > 0;

  // A pill in the wrapped row on a phone; a full-width row of the side column from `lg`.
  const pill = (active: boolean) => cn(
    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-13-5 font-semibold transition-colors duration-(--duration-base) lg:flex lg:w-full lg:justify-between lg:rounded-md",
    active
      ? "border-brand-600 bg-brand-600 text-brand-on"
      : "border-line-strong text-ink-2 hover:border-brand-ink hover:text-brand-ink",
  );

  return (
    <>
      <PageHero
        section="support"
        kicker="Downloads"
        title="Datasheets, drivers and firmware"
        lede="The files that go with the hardware we supply — find one by product, model number or the kind of file it is."
        crumbs={[{ name: "Downloads", path: "/downloads" }]}
      >
        <Suspense fallback={null}>
          <SearchForm
            action="/downloads"
            label="Search the downloads"
            placeholder="A product, a model number or a file…"
            defaultValue={term}
            className="h-11 min-w-0 flex-1 py-0 sm:max-w-[420px]"
          />
        </Suspense>
      </PageHero>

      {/*
        The shelves beside the list from `lg`, where a row of pills above a
        centred column left most of a wide screen empty on one side and the
        filter stranded on the other; above the list on anything narrower.
        Both start at the container's edge, under the heading they belong to.
      */}
      <Container
        data-aos="fade-up"
        className={cn("section-y", categories.length > 1 && "lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12")}
      >
        {categories.length > 1 && (
          <nav aria-label="Download categories" className="mb-8 lg:sticky lg:top-28 lg:mb-0 lg:self-start">
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap lg:gap-1.5">
              <li>
                <Link href="/downloads" className={pill(!shelf && !term)} aria-current={!shelf && !term ? "page" : undefined}>
                  All
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/downloads?category=${encodeURIComponent(category.slug)}`}
                    className={pill(category.slug === shelf)}
                    aria-current={category.slug === shelf ? "page" : undefined}
                  >
                    {category.name}
                    <span className={cn("text-12 font-normal", category.slug === shelf ? "text-brand-on" : "text-muted")}>
                      {category.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {failed ? (
          <ErrorState title="We could not load the downloads">
            Something is wrong at our end. Try again shortly, or get in touch and we will send you the file.
          </ErrorState>
        ) : rows.length === 0 ? (
          <EmptyState
            illustration={term ? "search" : "document"}
            title={term ? `Nothing found for “${term}”` : shelf ? "Nothing on this shelf yet" : "No downloads yet"}
            action={
              filtered
                ? <ButtonLink href="/downloads" variant="secondary">See all downloads</ButtonLink>
                : <ButtonLink href="/contact?subject=Downloads" variant="secondary">Ask us for a file</ButtonLink>
            }
          >
            {term
              ? "Try the model number on its own, or fewer words."
              : "Datasheets, drivers and firmware are added here as we publish them. If you need a file now, ask and we will send it."}
          </EmptyState>
        ) : (
          <div className="min-w-0 max-w-4xl">
            {term ? (
              <h2 className="display-3 mb-6">
                {total} result{total === 1 ? "" : "s"} for “{term}”
              </h2>
            ) : current ? (
              <div className="mb-6">
                <h2 className="display-3">{current.name}</h2>
                {current.description && <p className="mt-2 text-14-5 leading-[1.6] text-muted">{current.description}</p>}
              </div>
            ) : !grouped ? (
              <h2 className="display-3 mb-6">All downloads</h2>
            ) : null}

            {grouped ? (
              <div className="grid gap-10">
                {byShelf(rows).map((group) => (
                  <section key={group.key || "other"} aria-labelledby={`shelf-${group.key || "other"}`}>
                    <h2 id={`shelf-${group.key || "other"}`} className="display-3 mb-1">
                      {group.name ?? "Other files"}
                    </h2>
                    {categories.find((c) => c.slug === group.key)?.description && (
                      <p className="text-14-5 leading-[1.6] text-muted">
                        {categories.find((c) => c.slug === group.key)?.description}
                      </p>
                    )}
                    <DownloadList rows={group.items.map(downloadRow)} className="mt-5" />
                  </section>
                ))}
              </div>
            ) : (
              <DownloadList rows={rows.map(downloadRow)} />
            )}

            {downloads && downloads.meta.last_page > 1 && (
              <div className="mt-8">
                <Pagination
                  meta={downloads.meta}
                  basePath="/downloads"
                  params={{ q: term || undefined, category: shelf || undefined }}
                  showPerPage={false}
                  numbered
                />
              </div>
            )}
          </div>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
