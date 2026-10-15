import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";
import { bannerBlurFor, bannerFocusFor, bannerFor } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Atelier's heading block: a ruled masthead, the banner beneath it.
 *
 * The kicker sits on the rule as a label — small, letterspaced, in the
 * body face — and the heading hangs under it in the serif. The banner,
 * where the section has one, is full width below the words rather than
 * beside them: on an inner page the words are the subject and the
 * photograph is the illustration, which is the reverse of the front
 * page's hero.
 *
 * `hero_style` is ignored, as the manifest says; `tone` changes nothing,
 * since the ground is the page's paper in both schemes.
 */
export function PageHero({ kicker, title, lede, crumbs, children, section, settings }: PageHeroProps) {
  const picture = section ? bannerFor(settings, section) : null;
  const focus = focalStyle(bannerFocusFor(settings, section));
  return (
    <section className="page-hero">
      <Container className="pt-9 pb-10 lg:pt-12 lg:pb-12">
        {crumbs && <div className="mb-6 text-12-5"><Breadcrumbs crumbs={crumbs} /></div>}
        {kicker && (
          <p className="border-t border-line-strong pt-3 text-11-5 font-semibold uppercase tracking-[.16em] text-muted">{kicker}</p>
        )}
        <div className={cn("grid items-end gap-6 lg:grid-cols-[7fr_5fr] lg:gap-12", kicker ? "mt-5" : "border-t border-line-strong pt-8")}>
          <h1 className="display-2 text-balance">{title}</h1>
          {lede && <p className="lede measure text-ink-2 lg:pb-1.5">{lede}</p>}
        </div>
        {children && <div className="mt-8">{children}</div>}
        {picture && (
          <div className="relative mt-10 aspect-[21/9] overflow-hidden border border-line-strong">
            <Image src={picture} alt="" aria-hidden fill sizes="(min-width: 1280px) 1200px, 100vw" priority className="object-cover" style={focus} {...blurProps(bannerBlurFor(settings, section))} />
          </div>
        )}
      </Container>
    </section>
  );
}
