import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { FaqList } from "@/components/ui/faq";
import { PageHero, type Crumb } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { ProductGrid } from "@/app/(marketing)/products/product-grid";
import { IconArrowRight } from "@/components/icons";
import type { LandingPage } from "@/types/api";

/**
 * One renderer for all six kinds of programmatic page.
 *
 * Six components would drift, and they would drift in the direction that
 * matters: the thing keeping these pages out of doorway territory is that each
 * one carries the hardware or the local detail it is actually about, and a
 * variant written later is a variant where somebody left that out because the
 * copy looked long enough without it.
 *
 * So the shape is fixed here. Written introduction, then **the evidence** —
 * products for a catalogue page, the address and response time for a location
 * one — then optional body, then FAQs. The introduction is the reason the page
 * is not a duplicate of another; the evidence is the reason anybody would want
 * to read it.
 */
export function LandingPageView({ page, crumbs }: { page: LandingPage; crumbs: Crumb[] }) {
  const products = page.products ?? [];
  const location = page.location;
  const isLocal = page.kind === "location" || page.kind === "service_location" || page.kind === "solution_location";

  return (
    <>
      <PageHero
        kicker={page.brand?.name ?? location?.full_name ?? undefined}
        title={page.heading}
        crumbs={crumbs}
      />

      <Container className="section-y">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
          <div>
            {page.intro && <ProseWithShortcodes html={page.intro} />}
            {page.body && <div className="mt-8"><ProseWithShortcodes html={page.body} /></div>}

            {/*
              The catalogue half of the evidence. A page about a brand in a
              category that does not list that hardware is a page about nothing,
              which is exactly what the API refuses to publish — this is the
              rendering side of the same rule.
            */}
            {products.length > 0 && (
              <section className="mt-12">
                <h2 className="display-3">
                  {products.length} {products.length === 1 ? "product" : "products"} we supply
                </h2>
                <div className="mt-6">
                  <ProductGrid products={products} basePath="/products" headingLevel={3} />
                </div>
              </section>
            )}
          </div>

          {/*
            The local half. Rendered as a panel rather than woven into the prose
            because it is fact rather than argument — an address and a response
            time are what somebody scanning a "<service> in <city>" page came to
            find, and burying them in paragraph three is how a page that has the
            information still fails the person reading it.
          */}
          {isLocal && location && (
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-xl border border-line bg-surface p-5">
                <h2 className="text-[15px] font-semibold text-ink">{location.full_name}</h2>

                <dl className="mt-4 grid gap-3.5 text-[13.5px]">
                  {location.office_address && (
                    <div>
                      <dt className="font-semibold text-ink">Where we work from</dt>
                      <dd className="mt-0.5 whitespace-pre-line text-muted">{location.office_address}</dd>
                    </div>
                  )}
                  {location.response_time && (
                    <div>
                      <dt className="font-semibold text-ink">Attendance</dt>
                      <dd className="mt-0.5 text-muted">{location.response_time}</dd>
                    </div>
                  )}
                  {location.summary && (
                    <div>
                      <dt className="font-semibold text-ink">What we do here</dt>
                      <dd className="mt-0.5 text-muted">{location.summary}</dd>
                    </div>
                  )}
                </dl>

                {/*
                  What is actually done here, from the pivot an editor filled in.
                  The same list gates whether a "<service> in <place>" page may
                  exist and feeds `areaServed` in the structured data — so this
                  panel and the markup a crawler reads cannot drift apart.
                */}
                {(location.services?.length ?? 0) + (location.solutions?.length ?? 0) > 0 && (
                  <div className="mt-4 border-t border-line pt-3.5">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">
                      What we do here
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {[...(location.solutions ?? []), ...(location.services ?? [])].map((x) => (
                        <li key={x.slug} className="rounded border border-line-strong bg-card px-2 py-1 text-[12.5px] text-ink">
                          {x.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* The places inside this one — what makes a state page worth
                    having rather than a repetition of its cities. */}
                {(location.children?.length ?? 0) > 0 && (
                  <div className="mt-4 border-t border-line pt-3.5">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">
                      Also covered
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                      {(location.children ?? []).map((c) => (
                        <li key={c.slug}>
                          <Link href={`/locations/${c.slug}`} className="text-[13px] font-medium text-brand-ink hover:underline">
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Link
                  href="/contact"
                  className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-ink hover:underline"
                >
                  Ask about a site visit
                  <IconArrowRight className="size-4" />
                </Link>
              </div>
            </aside>
          )}
        </div>

        {(page.faqs?.length ?? 0) > 0 && (
          // FaqList owns its own h2 — wrapping it in another was a duplicate
          // heading and a level the outline did not need.
          <section className="mt-14"><FaqList faqs={page.faqs ?? []} /></section>
        )}
      </Container>

      <CtaBand
        title="Tell us what you have and what it has to do"
        body="An engineer will look at the site, not at a price list. You get the findings in writing whether or not you go ahead."
      />
    </>
  );
}
