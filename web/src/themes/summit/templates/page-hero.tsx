import { Backdrop } from "@/components/ui/backdrop";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { motionFor } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Summit's heading block: the dark centred band every inner page opens on
 * — the trail, the kicker as a pill, the heading and the lede on the
 * centre line over the theme's backdrop. The section's picture is not
 * drawn and `hero_style` is ignored, as the manifest says; `tone` changes
 * nothing. The heading has no width cap.
 */
export function PageHero({ kicker, title, lede, crumbs, children, settings }: PageHeroProps) {
  return (
    <section className="page-hero relative overflow-hidden border-b border-dark-line bg-dark text-dark-ink">
      <Backdrop variant={motionFor(settings).hero} tone="dark" size={48} mask="radial-gradient(ellipse 70% 70% at 50% 0%, #000 10%, transparent 75%)" />
      <Container className="relative flex flex-col items-center pt-10 pb-12 text-center lg:pt-14 lg:pb-16">
        {crumbs && <div className="mb-5 text-12-5"><Breadcrumbs crumbs={crumbs} onDark /></div>}
        {kicker && (
          <span className="inline-flex items-center gap-2 rounded-full border border-dark-line bg-dark-2 px-3.5 py-1.5 text-12 font-semibold text-brand-300">
            <i aria-hidden className="size-1.5 rounded-full bg-brand-300" />{kicker}
          </span>
        )}
        <h1 className={cn("display-2 text-balance", kicker && "mt-4")}>{title}</h1>
        {lede && <p className="lede measure mt-4 max-w-[64ch] text-dark-muted">{lede}</p>}
        {children && <div className="mt-7">{children}</div>}
      </Container>
    </section>
  );
}
