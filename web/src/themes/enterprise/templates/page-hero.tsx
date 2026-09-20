import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Enterprise's heading block: a navy band, the way the reference site
 * heads every inner page — the trail in small type, the kicker as an
 * eyebrow, the heading and the lede on `brand-900` under white (a step the
 * palette gate checks), with a thin accent rule along the foot. The
 * section's picture is not drawn and `hero_style` is ignored; both are
 * said in the manifest. The heading has no width cap, the rule every
 * hero follows.
 */
export function PageHero({ kicker, title, lede, crumbs, children }: PageHeroProps) {
  return (
    <section className="page-hero border-b-4 border-accent-500 bg-brand-900 text-white">
      <Container className="pt-8 pb-10 lg:pt-11 lg:pb-12">
        {crumbs && (
          <div className="mb-5 text-12-5">
            <Breadcrumbs crumbs={crumbs} onBanner />
          </div>
        )}
        {kicker && <span className="text-12 font-semibold uppercase tracking-[.14em] text-brand-200">{kicker}</span>}
        <h1 className={cn("display-2 text-balance", kicker && "mt-3")}>{title}</h1>
        {lede && <p className="lede measure mt-4 text-[rgba(255,255,255,.82)]">{lede}</p>}
        {children && <div className="mt-7">{children}</div>}
      </Container>
    </section>
  );
}
