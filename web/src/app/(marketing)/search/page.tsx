import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState } from "@/components/ui/empty";
import { IconSearchChart } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SearchForm } from "./search-form";
import type { SearchResults } from "@/types/api";

/**
 * Results are noindex.
 *
 * A search result page is generated from whatever somebody typed, and letting
 * a crawler index those puts an unbounded number of near-duplicate pages into
 * the index — all of them thin, none of them anything the site chose to
 * publish. The pages they link to are the ones worth indexing.
 */
export const metadata = buildMetadata({
  title: "Search",
  description: "Search products, solutions, guides and articles across the Technoware site.",
  path: "/search",
  seo: noIndex,
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = q.trim();

  let results: SearchResults | null = null;
  let failed = false;

  if (term) {
    try {
      results = await publicApi.search(term);
    } catch {
      // A search that cannot run says so; it does not render as "no results",
      // which tells somebody their part number does not exist when it does.
      failed = true;
    }
  }

  const groups = results?.data.groups ?? [];
  const total = results?.data.total ?? 0;
  const tooShort = Boolean(term) && results !== null && total === 0
    && term.length < (results.meta.min_length ?? 2);

  return (
    <>
      <PageHero
        kicker="Search"
        title={term ? `Results for “${term}”` : "Search"}
        lede={
          term
            ? undefined
            : "Products by name or part number, solutions, services, guides and articles."
        }
      >
        <SearchForm defaultValue={term} />
      </PageHero>

      <Container className="py-12 lg:py-16">
        {!term ? (
          <p className="text-[15px] text-muted">
            Type anything above — a product name, a SKU like{" "}
            <span className="font-mono text-[14px]">CBS350-24T-4G</span>, or a
            question you would ask support.
          </p>
        ) : failed ? (
          <EmptyState icon={<IconSearchChart />} title="Search is unavailable">
            Something went wrong running that search. It is not that there are
            no results — try again shortly.
          </EmptyState>
        ) : tooShort ? (
          <EmptyState icon={<IconSearchChart />} title="That search is too short">
            Use at least {results?.meta.min_length} characters, or almost
            everything matches.
          </EmptyState>
        ) : total === 0 ? (
          <EmptyState icon={<IconSearchChart />} title={`Nothing matches “${term}”`}>
            Try a shorter term or a part number. You can also{" "}
            <Link href="/contact" className="font-semibold text-brand-600 hover:underline">
              ask us directly
            </Link>
            .
          </EmptyState>
        ) : (
          <>
            <p className="mb-8 text-[14px] text-muted">
              {total} {total === 1 ? "result" : "results"} across{" "}
              {groups.length} {groups.length === 1 ? "section" : "sections"}.
            </p>

            <div className="grid gap-10">
              {groups.map((group) => (
                <section key={group.type}>
                  <div className="mb-3.5 flex flex-wrap items-baseline gap-x-3 border-b border-line pb-2">
                    <h2 className="text-[15.5px] font-semibold">{group.label}</h2>
                    <p className="text-[13px] text-muted">
                      {/* The count is of everything found, not of what is
                          shown — "5 results" would be a lie when there are 23. */}
                      {group.results.length < group.total
                        ? `showing ${group.results.length} of ${group.total}`
                        : `${group.total} ${group.total === 1 ? "match" : "matches"}`}
                    </p>
                  </div>

                  <ul className="grid gap-2">
                    {group.results.map((hit) => (
                      <li key={hit.path}>
                        <Link
                          href={hit.path}
                          className="block rounded-lg border border-line-strong bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-2"
                        >
                          <span className="block text-[15px] font-semibold text-ink">{hit.title}</span>
                          {hit.excerpt && (
                            <span className="mt-1 block text-[13.5px] leading-[1.55] text-muted">
                              {hit.excerpt}
                            </span>
                          )}
                          <span className="mt-1.5 block font-mono text-[12px] text-faint">{hit.path}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </Container>
    </>
  );
}
