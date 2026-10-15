import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import type { Crumb } from "@/components/ui/breadcrumbs";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import type { Industry, Product, Solution } from "@/types/api";

/*
 * The pieces of a solution's page, lifted out of its route (0.161.0) so the
 * route and a detail template draw each from the same code
 * (docs/page-builder.md "Detail templates"). Moved verbatim: with no template
 * active the route's markup is what it was.
 */

/** The theme's page heading, with the solution's three ways on. */
export function SolutionHero({ solution, crumbs }: { solution: Solution; crumbs: Crumb[] }) {
  return (
      <PageHero
        section="solutions"
        kicker="Solution"
        title={solution.title}
        lede={solution.summary}
        crumbs={crumbs}
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/contact?subject=${encodeURIComponent(solution.title)}`}>
            Talk to an engineer <IconArrowRight />
          </ButtonLink>
          <ButtonLink href="/products" variant="secondary">Browse related hardware</ButtonLink>
          {/* An engineer on site, with this solution noted (docs/visits.md). */}
          <ButtonLink href={`/book-a-visit?solution=${encodeURIComponent(solution.slug)}`} variant="secondary">
            Book a site visit
          </ButtonLink>
        </div>
      </PageHero>
  );
}

/** The written body: the problem and what we do. */
export function SolutionWritten({ solution }: { solution: Solution }) {
  return (
    <>
            {solution.problem_statement && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3">The problem</h2>
                <p className="lede mt-4">{solution.problem_statement}</p>
              </section>
            )}

            {solution.overview && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3 mb-4">What we do</h2>
                <ProseWithShortcodes html={solution.overview} />
              </section>
            )}
    </>
  );
}

/** What you get — the solution's benefits as a checklist. */
export function SolutionBenefits({ benefits, heading = "What you get", className }: { benefits: string[]; heading?: string; className?: string }) {
  return (
    <>
            {benefits.length > 0 && (
              <section data-aos="fade-up" className={className}>
                <h2 className="display-3">{heading}</h2>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {benefits.map((b) => (
                    <li key={b} className="flex items-start gap-3 rounded-lg border border-line-strong bg-card p-4">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" />
                      <span className="text-14-5 leading-[1.55]">{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
    </>
  );
}

/** The three lists that sit beside the written body: technologies, hardware, industries. */
export function SolutionRelated({ technologies, products, industries }: { technologies: string[]; products: Product[]; industries: Industry[] }) {
  return (
    <>
      {technologies.length > 0 && (
        <div className="rounded-xl border border-line-strong bg-surface p-5.5">
          <h2 className="text-15-5">Technologies we deploy</h2>
          <ul className="mt-3.5 flex flex-wrap gap-2">
            {technologies.map((t) => (
              <li key={t} className="rounded-full border border-line-strong bg-card px-3 py-1.5 font-mono text-12 text-muted">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {products.length > 0 && (
        <div className="rounded-xl border border-line-strong bg-card p-5.5">
          <h2 className="text-15-5">Hardware we use here</h2>
          <ul className="mt-3.5 grid gap-2.5">
            {products.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link href={`/products/${p.slug}`} className="block py-1 text-14 hover:text-brand-ink hover:underline">
                  {p.brand?.name ? `${p.brand.name} ` : ""}{p.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {industries.length > 0 && (
        <div className="rounded-xl border border-line-strong bg-card p-5.5">
          <h2 className="text-15-5">Common in</h2>
          <ul className="mt-3.5 flex flex-wrap gap-2">
            {industries.map((i) => (
              <li key={i.id}>
                <Link href={`/industries/${i.slug}`} className="block rounded-full border border-line-strong px-3 py-1.5 text-13 hover:border-brand-300 hover:bg-brand-50">
                  {i.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
