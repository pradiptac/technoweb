import Image from "next/image";
import Link from "next/link";
import { PageHero } from "@/components/ui/page-hero";
import type { Crumb } from "@/components/ui/breadcrumbs";
import { CountUp } from "@/components/ui/count-up";
import { blurProps } from "@/lib/blur";
import { focalStyle } from "@/lib/focal";
import { stripColumns } from "@/lib/strip-columns";
import { cn } from "@/lib/utils";
import type { CaseStudy } from "@/types/api";

/*
 * The pieces of a case study's page, lifted out of its route (0.161.0) so the
 * route and a detail template draw each from the same code
 * (docs/page-builder.md "Detail templates"). Moved verbatim; `flush` drops
 * the bottom margin the route leaves between the pieces, which a template's
 * own bands replace.
 */

/** The theme's page heading, with the client under it. */
export function CaseStudyHero({ study, crumbs }: { study: CaseStudy; crumbs: Crumb[] }) {
  return (
      <PageHero
        section="resources"
        kicker={study.industry?.name ?? "Case study"}
        title={study.title}
        lede={study.summary}
        crumbs={crumbs}
      >
        {study.client_name && (
          // No colour of its own: the heading's ground is the theme's — a dark
          // banner on some, the page on others — and `text-muted` on a dark
          // banner measured 1.18:1. It inherits the heading's ink instead.
          <p className="text-14">
            Client: <strong className="font-semibold">{study.client_name}</strong>
          </p>
        )}
      </PageHero>
  );
}

/** The figures the study achieved. */
export function CaseStudyResults({ study, flush = false }: { study: CaseStudy; flush?: boolean }) {
  const results = study.results ?? [];

  return (
    <>
        {results.length > 0 && (
          <dl className={cn(!flush && "mb-12", "grid gap-px overflow-hidden rounded-xl border border-line-strong bg-line", stripColumns(results.length))}>
            {results.map((r) => (
              <div key={r.label} className="bg-card p-6">
                <CountUp as="dd" value={r.value} className="font-display text-[30px] font-bold leading-none tracking-[-.03em] text-brand-ink" />
                <dt className="mt-2 text-13 text-muted">{r.label}</dt>
              </div>
            ))}
          </dl>
        )}
    </>
  );
}

/** The cover picture, in the 1200 by 630 box it is cropped to. */
export function CaseStudyCover({ study, flush = false }: { study: CaseStudy; flush?: boolean }) {
  return (
    <>
        {study.cover_image && (
          /*
            An aspect ratio, because this is the one image on the site whose
            box is not already fixed.

            Every other cover and thumbnail sits in a well with a set height —
            h-40, h-44, h-56 — so a slow image cannot move anything. This one
            is full-width and unconstrained, so the whole article body below it
            jumps down the moment the image arrives. Nothing shifts today
            because the placeholder art is a 2KB SVG served from localhost;
            it will the day a real photograph lands, which is exactly the
            defect that is invisible until it is expensive.

            1200/630 is what the cover generator produces and what og:image
            wants, so a real photograph should be cut to it anyway.
          */
          <div className={cn("relative", !flush && "mb-12", "aspect-[1200/630] w-full overflow-hidden rounded-xl border border-line")}>
            <Image
              src={study.cover_image}
              alt={study.cover_image_alt ?? ""}
              fill
              sizes="(min-width: 1920px) 1728px, 90vw"
              priority
              className="object-cover"
              style={focalStyle(study.cover_image_focus)} {...blurProps(study.cover_image_blur)}
            />
          </div>
        )}
    </>
  );
}

/** The way back to the list. */
export function CaseStudyBack() {
  return (
      <p className="mt-12 border-t border-line pt-6">
        <Link href="/case-studies" className="inline-block py-1 text-14 font-semibold text-brand-ink hover:underline">
          ← All case studies
        </Link>
      </p>
  );
}
