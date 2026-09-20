import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { bannerFor } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Launch's heading block: a rounded panel on the page, the words on the
 * left and the section's picture framed on the right.
 *
 * The panel is the brand wash (`bg-brand-50`, which inverts), so the words
 * are the page's own ink and the contrast is the page's — a picture never
 * goes behind text here. The trail sits above the kicker chip; the heading
 * has no width cap, the rule every hero follows. With no banner configured
 * the panel is the words alone, a little shorter. `tone` is accepted for
 * the contract's sake and changes nothing.
 */
export function PageHero({ kicker, title, lede, crumbs, children, section, settings }: PageHeroProps) {
  const picture = section ? bannerFor(settings, section) : null;

  return (
    <section className="page-hero pt-4 pb-6 lg:pt-6 lg:pb-8">
      <Container>
        <div
          data-card
          className={cn(
            "grid items-center gap-8 rounded-3xl bg-brand-50 px-7 py-9 lg:px-12 lg:py-12",
            picture && "lg:grid-cols-[1.15fr_1fr] lg:gap-14",
          )}
        >
          <div className="min-w-0">
            {crumbs && (
              <div className="mb-5">
                <Breadcrumbs crumbs={crumbs} />
              </div>
            )}
            {kicker && (
              <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-11-5 font-semibold uppercase tracking-[.1em] text-brand-ink">
                <i aria-hidden className="size-1.5 rounded-full bg-brand-500" />
                {kicker}
              </span>
            )}
            <h1 className={cn("display-2 text-balance", kicker && "mt-4")}>{title}</h1>
            {lede && <p className="lede measure mt-4">{lede}</p>}
            {children && <div className="mt-7">{children}</div>}
          </div>
          {picture && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-line-strong shadow-2 lg:aspect-[4/3]">
              <Image src={picture} alt="" aria-hidden fill sizes="(min-width: 1024px) 40vw, 100vw" priority className="object-cover" />
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
