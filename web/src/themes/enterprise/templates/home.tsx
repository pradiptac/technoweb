import Image from "next/image";
import Link from "next/link";
import {
  CaseStudies, Credentials, Industries, Partners, ProductCategories,
  Resources, SupportBand, TrustedBy, WhyUs,
} from "@/components/home/sections";
import { Reviews } from "@/components/home/reviews";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";
import { ServiceTabs } from "../service-tabs";

/**
 * Enterprise's front page: a sequence of proof.
 *
 * The reference site has no photographic hero; it opens on a short navy
 * band and gets straight to evidence. So: a **statement band** on the
 * brand's deep steps — the kicker, the headline, the lede and two buttons
 * on the left, the slider or the boardroom picture in a plain frame on the
 * right — with the four statistics along its foot as a white strip. Then
 * the certifications as an awards strip; three **showcase cards** — the
 * first three solutions, each with its own picture or one of the theme's
 * and a "Learn more"; the solutions again as **tabs**, picture beside
 * paragraph (`service-tabs.tsx`); and the classic sections from the
 * partners on, with the case studies as their grid. Every card is
 * `data-card`, so the theme's square-with-a-rule treatment reaches them.
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const look = statLookFor(settings);
  const { kicker, heading, lede } = heroCopy(settings);
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };
  const pictures = ["/themes/enterprise/boardroom.jpg", "/themes/enterprise/servers.jpg"];

  const hero = (
    <section className="bg-brand-900 text-white">
      <Container className="grid items-center gap-10 pt-12 pb-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-16 lg:pb-14 [&>*]:min-w-0">
        <div>
          <span className="text-12 font-semibold uppercase tracking-[.14em] text-brand-200">{kicker}</span>
          <h1 className="display-1 mt-4 text-balance">{heading}</h1>
          <p className="lede mt-5 text-[rgba(255,255,255,.82)]">{lede}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/contact" variant="onDark">Talk to an engineer <IconArrowRight /></ButtonLink>
            <ButtonLink href="/solutions" variant="onDarkOutline" className="border-white/30 text-white">Our practices</ButtonLink>
          </div>
        </div>
        <div className="overflow-hidden rounded-sm border border-white/15 bg-brand-800">
          {hasSlider ? (
            <SliderFor slider={heroSlider!} aspect="aspect-[16/10]" sizes="(min-width: 1024px) 45vw, 100vw" priority />
          ) : (
            <div className="relative aspect-[16/10]">
              <Image src={pictures[0]} alt="" aria-hidden fill sizes="(min-width: 1024px) 45vw, 100vw" priority className="object-cover" />
            </div>
          )}
        </div>
      </Container>
      {/* The statistics along the band's foot, on a white strip. */}
      <div className="border-t border-white/10 bg-card text-ink">
        <Container>
          <dl className={cn("stat-figures grid divide-line sm:divide-x", stripColumns(stats.length, 2))} {...statFigures(look)}>
            {stats.map((s, i) => (
              <div key={s.label} className={cn("py-5 sm:px-6", i === 0 && "sm:pl-0")}>
                <StatFigure stat={s} inline />
              </div>
            ))}
          </dl>
        </Container>
      </div>
    </section>
  );

  const showcase = (
    <section className="section-y">
      <Container>
        <SectionHeader kicker="What we do" title="Practices built for the long run" />
        <div className="grid gap-6 md:grid-cols-3">
          {solutions.data.slice(0, 3).map((s, i) => (
            <article key={s.slug} data-card className="flex flex-col overflow-hidden rounded-sm border border-line-strong bg-card">
              <div className="relative aspect-[16/10] bg-surface-2">
                <Image src={s.hero_image ?? pictures[i % pictures.length]} alt={s.hero_image ? s.hero_image_alt ?? "" : ""} aria-hidden={!s.hero_image || undefined} fill sizes="(min-width: 768px) 33vw, 100vw" loading="eager" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-19 font-semibold">{s.title}</h3>
                {s.summary && <p className="mt-2 text-14-5 leading-relaxed text-muted">{s.summary}</p>}
                <Link href={`/solutions/${s.slug}`} className="mt-auto inline-flex items-center gap-1.5 pt-5 text-13-5 font-semibold text-brand-ink hover:underline">
                  Learn more <IconArrowRight className="size-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );

  const tabs = (
    <section className="section-y bg-surface">
      <Container>
        <SectionHeader kicker="Services" title="One partner across the stack" />
        <ServiceTabs items={solutions.data.slice(0, 6).map((s) => ({ slug: s.slug, title: s.title, summary: s.summary, href: `/solutions/${s.slug}` }))} />
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: hero },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    { id: "solutions", node: showcase },
    // The static web-services grid is not drawn; its slot carries the tabs.
    { id: "web", node: tabs },
    { id: "partners", node: <Partners items={brands.data} /> },
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 12)} /> },
    { id: "why", node: <WhyUs /> },
    { id: "clients", node: <TrustedBy items={clients.data} /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "support", node: <SupportBand settings={settings} /> },
    { id: "cases", node: <CaseStudies items={caseStudies.data.slice(0, 6)} /> },
    { id: "resources", node: <Resources items={posts.data.slice(0, 4)} /> },
    { id: "cta", node: <CtaBand tone="brand" size="lg" className="pt-0" /> },
  ];

  return (
    <>
      {orderSections(SECTIONS, options).map((s) => (
        <Bg key={s.id} id={s.id} {...bg}>{s.node}</Bg>
      ))}
    </>
  );
}
