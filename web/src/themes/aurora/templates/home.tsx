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
 * Aurora's front page: the wash, then everything with room around it.
 *
 * The hero is the words on the centre line over a wide brand-to-accent
 * wash, the product under them in a frame whose edge catches the light —
 * the slider, or the NOC panel. The statistics sit on the wash as plain
 * figures rather than in a card, because a bordered box on a wash is the
 * hard edge this theme is defined by not having.
 *
 * **Everything below the hero is a shared section**, redrawn by Aurora's
 * idiom block in `theme.css` rather than re-implemented here: the
 * solutions, the categories, the industries, the services, the case
 * studies and the resources are the same components every theme renders,
 * and the whole of what makes them Aurora's is CSS keyed on
 * `[data-theme="aurora"]`. What is written out in this file is only what
 * genuinely differs — the hero and the figures — which is the smallest a
 * theme can be and still be one.
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
    <section className="aurora-wash relative overflow-hidden">
      <Container className="relative flex flex-col items-center pt-14 pb-12 text-center lg:pt-20 lg:pb-16">
        <span className="inline-flex items-center gap-2 rounded-full bg-card/70 px-4 py-1.5 text-12-5 font-semibold text-brand-ink backdrop-blur-sm">{kicker}</span>
        <HeroTitle className="display-1 mt-6 max-w-[22ch] text-balance [overflow-wrap:anywhere]">{heading}</HeroTitle>
        <p className="lede mt-5 max-w-[60ch] text-ink-2">{lede}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/contact" size="lg">Talk to us <IconArrowRight /></ButtonLink>
          <ButtonLink href="/solutions" variant="secondary" size="lg">See what we do</ButtonLink>
        </div>

        <div className="aurora-frame mt-12 w-full max-w-[1120px] overflow-hidden rounded-[26px] p-2">
          {hasSlider ? (
            <SliderFor slider={heroSlider!} aspect="aspect-[16/9]" sizes="(min-width: 1180px) 1120px, 100vw" priority className="rounded-[20px]" />
          ) : (
            <div className="overflow-hidden rounded-[20px] bg-dark-2"><NocPanel /></div>
          )}
        </div>

        {/*
          On the wash, unboxed. A card here would be the one bordered
          rectangle in the theme, and the figures read perfectly well as
          figures when the only thing separating them is space.
        */}
        <dl className={cn("stat-figures mt-12 grid w-full gap-8", stripColumns(stats.length, 2))} {...statFigures(look)}>
          {stats.map((s) => <StatFigure key={s.label} stat={s} />)}
        </dl>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: hero },
    { id: "solutions", node: <Solutions items={solutions.data.slice(0, 6)} /> },
    { id: "partners", node: <Partners items={brands.data} mode="swell" /> },
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 8)} /> },
    { id: "why", node: <WhyUs settings={settings} /> },
    { id: "clients", node: <TrustedBy items={clients.data} mode="press" /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "web", node: <Services services={services.data} categories={serviceCategories.data} /> },
    { id: "support", node: <SupportBand settings={settings} /> },
    { id: "cases", node: <CaseStudies items={caseStudies.data.slice(0, 6)} /> },
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
