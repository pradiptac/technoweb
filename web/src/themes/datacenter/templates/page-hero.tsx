import { Backdrop } from "@/components/ui/backdrop";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { motionFor } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Datacenter's heading block: always the dark band, always the grid.
 *
 * Every page opens like the console does — on `dark` with the theme's
 * backdrop behind it — so the header and the hero read as one panel. The
 * section banner a page names is not drawn: a photograph under a
 * blueprint grid is two pictures fighting. The kicker is a mono label with
 * a slash prefix (`// solutions`), the trail sits above it in mono too,
 * and the heading is the display face on `dark-ink`. `tone` is accepted
 * for the contract's sake and changes nothing here.
 */
export function PageHero({ kicker, title, lede, crumbs, children, settings }: PageHeroProps) {
  return (
    <section className="page-hero relative overflow-hidden border-b border-dark-line bg-dark text-dark-ink">
      <Backdrop
        variant={motionFor(settings).hero}
        tone="dark"
        size={48}
        mask="radial-gradient(ellipse 80% 70% at 50% 0%, #000 20%, transparent 75%)"
      />
      <Container className="relative pt-9 pb-11 lg:pt-12 lg:pb-14">
        {crumbs && (
          <div className="mb-6 font-mono text-12">
            <Breadcrumbs crumbs={crumbs} onDark />
          </div>
        )}
        {kicker && (
          <span className="font-mono text-12 font-semibold uppercase tracking-[.14em] text-brand-300">
            <span aria-hidden className="text-dark-muted">{"// "}</span>{kicker}
          </span>
        )}
        <h1 className={cn("display-2 max-w-[26ch] text-balance", kicker && "mt-3")}>{title}</h1>
        {lede && <p className="lede measure mt-4 text-dark-muted">{lede}</p>}
        {children && <div className="mt-7">{children}</div>}
      </Container>
    </section>
  );
}
