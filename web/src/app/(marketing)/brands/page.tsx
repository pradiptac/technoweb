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
  title: "Brands we supply",
  description: "The manufacturers our engineers deploy, configure and support — and what we carry from each.",
  path: "/brands",
});

/**
 * The brand index.
 *
 * Built from **published landing pages**, not from the brands table, and the
 * difference is the whole point. `/brands` listing every brand would link to a
 * page for each, most of which would be a name and three products — thin pages
 * created by an index rather than by anyone deciding they were worth having.
 * A brand appears here once it has a page that passed the quality gate;
 * everything else is still reachable as a filter on the catalogue.
 */
export default async function BrandsPage() {
  const pages = await publicApi.landingPages("brand").catch(() => ({ data: [] as LandingPageSummary[] }));

  return (
    <>
      <PageHero
        kicker="Brands"
        title="The manufacturers we actually deploy"
        lede="Hardware our own engineers install, configure and support in the field — not a distributor's whole price list."
        crumbs={[{ name: "Brands", path: "/brands" }]}
      />

      <Container className="section-y">
        {pages.data.length === 0 ? (
          <EmptyState title="Nothing here yet">
            Brand pages are written one at a time. In the meantime the whole
            catalogue is on the products page, filterable by manufacturer.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.data.map((p, i) => (
              <li key={p.path} data-aos="fade-up" data-aos-delay={STAGGER[i % STAGGER.length]}>
                <Link
                  href={p.path}
                  className="flex h-full flex-col rounded-lg border border-line-strong bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-2"
                >
                  <h2 className="text-[16.5px] font-semibold text-ink">{p.brand?.name ?? p.title}</h2>
                  <p className="mt-1.5 text-[13.5px] text-muted">{p.heading}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="measure mt-8 text-[13.5px] text-muted">
          Looking for something specific?{" "}
          <Link href="/products" className="font-semibold text-brand-ink hover:underline">
            Search the whole catalogue
          </Link>{" "}
          — every manufacturer we carry is a filter there, whether or not it has a page here.
        </p>
      </Container>

      <CtaBand />
    </>
  );
}
