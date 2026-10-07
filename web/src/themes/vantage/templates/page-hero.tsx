import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";
import { bannerBlurFor, bannerFocusFor, bannerFor } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Vantage's heading block: the dark photograph band every inner page opens
 * on, under the see-through header — it stamps `data-vantage-dark`, which
 * is what puts the header into its glass state. The section's banner when
 * one is configured, the theme's office photograph otherwise, at low
 * opacity under a gradient whose lowest stop is the band's opaque dark, so
 * the words are on that and not on the picture. The trail, the kicker with
 * its accent dot, the heading with no width cap, the lede. `hero_style` is
 * ignored, as the manifest says; `tone` changes nothing.
 */
export function PageHero({ kicker, title, lede, crumbs, children, section, settings }: PageHeroProps) {
  const picture = (section && bannerFor(settings, section)) || "/themes/vantage/office.jpg";
  // The point belongs to the uploaded banner; the shipped office photograph has none.
  const focus = section && bannerFor(settings, section) ? focalStyle(bannerFocusFor(settings, section)) : undefined;
  return (
    <section data-vantage-dark className="page-hero relative overflow-hidden bg-dark text-white">
      <Image src={picture} alt="" aria-hidden fill sizes="100vw" priority className="object-cover opacity-35" style={focus} {...blurProps(bannerBlurFor(settings, section))} />
      <div aria-hidden className="absolute inset-0 bg-linear-to-t from-dark via-dark/80 to-dark/40" />
      <Container className="relative pt-[calc(var(--h-site-header)+var(--h-info-bar,0px)+44px)] pb-12 lg:pt-[calc(var(--h-site-header)+var(--h-info-bar,0px)+64px)] lg:pb-16">
        {crumbs && <div className="mb-5 text-12-5"><Breadcrumbs crumbs={crumbs} onDark /></div>}
        {kicker && (
          <p className="flex items-center gap-2.5 text-14 font-semibold text-accent-300">
            <i aria-hidden className="size-2 rounded-full bg-accent-400" />{kicker}
          </p>
        )}
        <h1 className={cn("display-2 text-balance", kicker && "mt-4")}>{title}</h1>
        {lede && <p className="lede measure mt-4 text-[rgba(255,255,255,.82)]">{lede}</p>}
        {children && <div className="mt-7">{children}</div>}
      </Container>
    </section>
  );
}
