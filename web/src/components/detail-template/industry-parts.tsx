import Link from "next/link";
import { ArrowLink } from "@/components/ui/button";
import { Card, CardHead } from "@/components/ui/card";
import { PageHero } from "@/components/ui/page-hero";
import type { Crumb } from "@/components/ui/breadcrumbs";
import type { Industry } from "@/types/api";

/*
 * The pieces of an industry's page, lifted out of its route (0.161.0) so the
 * route and a detail template draw each from the same code
 * (docs/page-builder.md "Detail templates"). Moved verbatim.
 */

/** The theme's page heading. */
export function IndustryHero({ industry, crumbs }: { industry: Industry; crumbs: Crumb[] }) {
  return (
      <PageHero
        section="industries"
        kicker="Industry"
        title={`Infrastructure for ${industry.name.toLowerCase()}`}
        lede={industry.summary}
        crumbs={crumbs}
      />
  );
}

/** The solutions we usually start with, and the line that invites a description of the setup. */
export function IndustrySolutions({ industry }: { industry: Industry }) {
  const solutions = industry.solutions ?? [];

  return (
    <>
        {solutions.length > 0 && (
          <section>
            <h2 className="display-3 mb-6">Where we usually start</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {solutions.map((s) => {
                return (
                  <Card key={s.id} beam>
                    <CardHead iconName={s.icon} className="text-17">{s.title}</CardHead>
                    <p className="text-14-5 leading-[1.58] text-muted">{s.summary}</p>
                    <ArrowLink href={`/solutions/${s.slug}`} className="mt-4">Read more</ArrowLink>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <p className="mt-12 text-14-5 text-muted">
          Not sure which applies to you?{" "}
          <Link href="/contact" className="font-semibold text-brand-ink hover:underline">
            Describe your setup
          </Link>{" "}
          and we will tell you what we would look at first.
        </p>
    </>
  );
}
