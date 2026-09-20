import { Backdrop } from "@/components/ui/backdrop";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { motionFor } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Sentinel's heading block: the dark band every inner page opens on, the
 * words on the left in the light display face, the seam under it. The
 * section's picture is not drawn and `hero_style` is ignored, as the
 * manifest says; `tone` changes nothing. No width cap on the heading.
 */
export function PageHero({ kicker, title, lede, crumbs, children, settings }: PageHeroProps) {
  return (
    <section className="page-hero relative overflow-hidden bg-dark text-dark-ink">
      <Backdrop variant={motionFor(settings).hero} tone="dark" size={64} mask="radial-gradient(ellipse 60% 80% at 85% 20%, #000 10%, transparent 70%)" />
      <Container className="relative pt-10 pb-12 lg:pt-14 lg:pb-16">
        {crumbs && <div className="mb-5 text-12-5"><Breadcrumbs crumbs={crumbs} onDark /></div>}
        {kicker && (
          <p className="flex items-center gap-2.5 text-13 text-brand-300">
            <i aria-hidden className="sentinel-dot size-2 rounded-full bg-brand-300" />{kicker}
          </p>
        )}
        <h1 className={cn("display-2 text-balance", kicker && "mt-4")}>{title}</h1>
        {lede && <p className="lede measure mt-4 text-dark-muted">{lede}</p>}
        {children && <div className="mt-7">{children}</div>}
      </Container>
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-brand-300 to-transparent" />
    </section>
  );
}
