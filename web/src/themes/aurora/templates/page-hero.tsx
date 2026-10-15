import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";
import { bannerBlurFor, bannerFocusFor, bannerFor } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Aurora's heading block: the wash, the words on the left, the banner
 * framed beside them.
 *
 * Every other light theme opens an inner page on a band or a plain
 * container; this opens on the same wash the front page does, so moving
 * from the homepage to a solution is one continuous surface. The split is
 * `7fr | 5fr` — the proportion pass's rule, sized by its content — and
 * collapses under `lg`, where the picture goes under the words rather
 * than beside them.
 *
 * `hero_style` is ignored, as the manifest says, and `tone` changes
 * nothing: the ground is the page's in both schemes, so there is no light
 * and dark variant to pick between.
 */
export function PageHero({ kicker, title, lede, crumbs, children, section, settings }: PageHeroProps) {
  const picture = section ? bannerFor(settings, section) : null;
  const focus = focalStyle(bannerFocusFor(settings, section));
  return (
    <section className="aurora-wash page-hero relative overflow-hidden">
      <Container className={cn("relative grid items-center gap-10 pt-10 pb-12 lg:gap-14 lg:pt-14 lg:pb-16", picture && "lg:grid-cols-[7fr_5fr]")}>
        <div className="min-w-0">
          {crumbs && <div className="mb-5 text-12-5"><Breadcrumbs crumbs={crumbs} /></div>}
          {kicker && <span className="inline-flex items-center rounded-full bg-card/70 px-3.5 py-1.5 text-12 font-semibold text-brand-ink backdrop-blur-sm">{kicker}</span>}
          <h1 className={cn("display-2 text-balance", kicker && "mt-4")}>{title}</h1>
          {lede && <p className="lede measure mt-4 text-ink-2">{lede}</p>}
          {children && <div className="mt-7">{children}</div>}
        </div>
        {picture && (
          <div className="aurora-frame overflow-hidden rounded-[22px] p-1.5">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[18px]">
              <Image src={picture} alt="" aria-hidden fill sizes="(min-width: 1024px) 40vw, 100vw" priority className="object-cover" style={focus} {...blurProps(bannerBlurFor(settings, section))} />
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
