import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { EmptyState } from "@/components/ui/empty";
import { PageHero } from "@/components/ui/page-hero";
import { publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { STAGGER } from "@/lib/utils";
import type { LandingPageSummary } from "@/types/api";

export const metadata = buildMetadata({
  title: "Where we work",
  description: "The places our engineers attend sites, and what we do in each.",
  path: "/locations",
});

/**
 * Where the company works, listed from pages that exist.
 *
 * Nothing here is generated from a list of cities. A place appears once
 * somebody has recorded something concrete about working in it and written a
 * page that is not a near-duplicate of another — which is deliberately harder
 * than adding a row, because a list of thirty cities with a paragraph each is
 * the single most recognisable spam pattern on the web and it is also a claim
 * about where this company sends people.
 */
export default async function LocationsPage() {
  const [places, all] = await Promise.all([
    publicApi.landingPages("location").catch(() => ({ data: [] as LandingPageSummary[] })),
    publicApi.landingPages().catch(() => ({ data: [] as LandingPageSummary[] })),
  ]);

  // Service and solution pages, grouped under the place they belong to.
  const under = (slug: string) =>
    all.data.filter((p) => p.location?.slug === slug && p.kind !== "location");

  return (
    <>
      <PageHero
        kicker="Coverage"
        title="Where our engineers actually go"
        lede="We list the places we attend sites, with what we do there and how quickly. If yours is not here, ask — it is a question about travel time rather than a closed door."
        crumbs={[{ name: "Where we work", path: "/locations" }]}
      />

      <Container className="section-y">
        {places.data.length === 0 ? (
          <EmptyState title="Nothing published yet">
            Coverage pages are written per place, with the detail that makes them
            worth reading. Until then, the contact page is the fastest route to an
            answer about a specific site.
          </EmptyState>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2">
            {places.data.map((p, i) => {
              const children = under(p.location?.slug ?? "");

              return (
                <li key={p.path} data-aos="fade-up" data-aos-delay={STAGGER[i % STAGGER.length]}>
                  <div className="flex h-full flex-col rounded-lg border border-line-strong bg-card p-5">
                    <h2 className="text-[16.5px] font-semibold">
                      <Link href={p.path} className="text-ink hover:text-brand-ink hover:underline">
                        {p.location?.name ?? p.title}
                      </Link>
                    </h2>
                    {p.location?.state && (
                      <p className="mt-0.5 text-[13px] text-muted">{p.location.state}</p>
                    )}

                    {children.length > 0 && (
                      <ul className="mt-3.5 flex flex-wrap gap-2">
                        {children.map((c) => (
                          <li key={c.path}>
                            <Link
                              href={c.path}
                              className="inline-block rounded border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink hover:border-brand-300"
                            >
                              {c.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
