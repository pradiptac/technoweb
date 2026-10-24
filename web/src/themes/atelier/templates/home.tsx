import { homeBlockSections } from "@/components/blocks/home-block-sections";
import {
  CaseStudies, Industries, Partners, ProductCategories, Resources, Solutions, SupportBand, TrustedBy, Services, WhyUs,
} from "@/components/home/sections";
import { NocPanel } from "@/components/home/noc-panel";
import { Reviews } from "@/components/home/reviews";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { SliderFor } from "@/components/ui/slider-for";
import { StatFigure, statFigures } from "@/components/ui/stat";
import { IconArrowRight } from "@/components/icons";
import { heroStats } from "@/content/site";
import { statLookFor } from "@/lib/stat-look";
import { heroCopy, statPairs } from "@/lib/site-settings";
import { stripColumns } from "@/lib/strip-columns";
import { HeroTitle } from "@/lib/hero-heading";
import { cn } from "@/lib/utils";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";

/**
 * Atelier's front page: a masthead, then the work.
 *
 * The hero is asymmetric — the words in the wider column, the picture in
 * the narrower one running off the right edge of the container, which is
 * the one place in the product where something deliberately leaves the
 * grid. The statistics are a ruled row under it, figures separated by
 * hairlines rather than sat in cards.
 *
 * **Everything below is a shared section**, redrawn by Atelier's idiom
 * block in `theme.css`: the solutions, the categories, the industries,
 * the services, the case studies and the resources are the components
 * every theme renders. What this file writes out is only the hero and
 * the ruled figures.
 *
 * With no slider assigned the narrow column holds the NOC panel, as every
 * other theme's hero does. A stock photograph would be truer to the
 * studio idea, and this theme ships without one deliberately: the two
 * Freepik pictures Launch carries are licensed assets committed to the
 * repository, and a theme that needs a picture to look right is a theme
 * that looks wrong on an install whose own pictures are in place.
 */
export function Home({
  settings, solutions, categories, industries, services, serviceCategories, caseStudies, posts, brands, clients, heroSlider, blocks, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const look = statLookFor(settings);
  const { kicker, heading, lede } = heroCopy(settings);
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };

  const hero = (
    // `overflow-hidden` is load-bearing: the picture's negative margin below
    // runs it off the container, and on an unclipped parent that is
    // horizontal overflow on the document — measured at 16px at 1440 by
    // `scripts/probes/strip-modes.mjs`, which reads `scrollWidth` per theme.
    <section className="overflow-hidden border-b border-line-strong">
      <Container className="grid items-center gap-10 pt-8 pb-12 lg:grid-cols-[7fr_5fr] lg:gap-14 lg:pt-12 lg:pb-16">
        <div className="min-w-0">
          <p className="text-11-5 font-semibold uppercase tracking-[.16em] text-muted">{kicker}</p>
          <HeroTitle className="display-1 mt-5 max-w-[18ch] text-balance [overflow-wrap:anywhere]">{heading}</HeroTitle>
          <p className="lede mt-5 max-w-[52ch] text-ink-2">{lede}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/contact" size="lg">Start a project <IconArrowRight /></ButtonLink>
            <ButtonLink href="/case-studies" variant="secondary" size="lg">See the work</ButtonLink>
          </div>
        </div>

        {/*
          The picture runs off the container's right edge from `lg` — the
          one element in the theme that leaves the grid, and the reason
          the hero clips rather than the page: a negative margin on an
          unclipped parent is horizontal overflow, which the audit fails.
        */}
        <div className="atelier-bleed relative">
          {hasSlider ? (
            <SliderFor slider={heroSlider!} aspect="aspect-[4/5]" sizes="(min-width: 1024px) 46vw, 100vw" priority />
          ) : (
            <div className="overflow-hidden border border-line-strong bg-dark-2"><NocPanel /></div>
          )}
        </div>
      </Container>
    </section>
  );

  const figures = (
    <section className="border-b border-line-strong">
      <Container>
        <dl className={cn("atelier-figures grid", stripColumns(stats.length, 2))} {...statFigures(look)}>
          {stats.map((s) => (
            <div key={s.label} className="py-8">
              <StatFigure stat={s} />
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: <>{hero}{figures}</> },
    { id: "solutions", node: <Solutions items={solutions.data.slice(0, 6)} /> },
    { id: "partners", node: <Partners items={brands.data} mode="press" /> },
    { id: "cases", node: <CaseStudies items={caseStudies.data.slice(0, 6)} /> },
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 8)} /> },
    { id: "why", node: <WhyUs settings={settings} /> },
    { id: "clients", node: <TrustedBy items={clients.data} mode="swell" /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "web", node: <Services services={services.data} categories={serviceCategories.data} /> },
    { id: "support", node: <SupportBand settings={settings} /> },
    { id: "resources", node: <Resources items={posts.data.slice(0, 4)} /> },
    ...homeBlockSections(blocks),
    { id: "cta", node: <CtaBand tone="brand" size="lg" /> },
  ];

  return (
    <>
      {orderSections(SECTIONS, options).map((s, i) => (
        <Bg key={s.id} id={s.id} index={i} {...bg}>{s.node}</Bg>
      ))}
    </>
  );
}
