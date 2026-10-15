import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";
import { bannerBlurFor, bannerFocusFor, bannerFor } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";
import { GradientHeading } from "../gradient-heading";

/**
 * Keystone's heading block: centred on the page ground — the trail, the
 * kicker as a chip, the heading with its gradient close, the lede — and
 * the section's banner under the words in the glowing frame the front
 * page gives the product. `hero_style` is ignored, as the manifest says;
 * `tone` changes nothing; the heading has no width cap.
 */
export function PageHero({ kicker, title, lede, crumbs, children, section, settings }: PageHeroProps) {
  const picture = section ? bannerFor(settings, section) : null;
  const focus = focalStyle(bannerFocusFor(settings, section));
  return (
    <section className="page-hero">
      <Container className="flex flex-col items-center pt-10 pb-8 text-center lg:pt-14 lg:pb-10">
        {crumbs && <div className="mb-5 text-12-5"><Breadcrumbs crumbs={crumbs} /></div>}
        {kicker && <span className="inline-flex items-center rounded-full bg-brand-50 px-3.5 py-1.5 text-12 font-semibold text-brand-ink">{kicker}</span>}
        <GradientHeading as="h1" className={cn("display-2 text-balance", kicker && "mt-4")} text={title} />
        {lede && <p className="lede measure mt-4 max-w-[64ch] text-ink-2">{lede}</p>}
        {children && <div className="mt-7">{children}</div>}
        {picture && (
          <div className="keystone-frame mt-10 w-full max-w-[1180px] overflow-hidden rounded-2xl border border-line-strong bg-dark p-2">
            <div className="relative aspect-[21/9] overflow-hidden rounded-xl">
              <Image src={picture} alt="" aria-hidden fill sizes="(min-width: 1280px) 1180px, 100vw" priority className="object-cover" style={focus} {...blurProps(bannerBlurFor(settings, section))} />
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
