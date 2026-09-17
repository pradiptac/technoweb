import Image from "next/image";
import {
  CaseStudies, Credentials, Partners, Resources, SupportBand, TrustedBy, WebServices,
} from "@/components/home/sections";
import { Reviews } from "@/components/home/reviews";
import { Backdrop } from "@/components/ui/backdrop";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { IconTile } from "@/components/ui/icon-tile";
import { CtaBand } from "@/components/ui/cta-band";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { SliderFor } from "@/components/ui/slider-for";
import { StatFigure, statFigures } from "@/components/ui/stat";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { heroStats, testimonial } from "@/content/site";
import { motionFor } from "@/lib/motion-choices";
import { statLookFor } from "@/lib/stat-look";
import { heroCopy, statPairs } from "@/lib/site-settings";
import { stripColumns } from "@/lib/strip-columns";
import { cn } from "@/lib/utils";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";
import { CatalogueTabs } from "../catalogue-tabs";

/**
 * Summit's front page: the product company's launch page, centred.
 *
 * Modelled on everestims.com: a dark hero with everything on the centre
 * line — the kicker as a pill, the headline, the lede, two buttons, and
 * under them a row of trust badges (the certifications, since this site
 * has no G2 rating) — over the theme's plexus picture at low opacity, with
 * the slider, when there is one, in a frame under the words like a
 * product screenshot. Then the trusted-by strip (the partners), the
 * statistics as four tiles, the **tabbed catalogue**
 * (solutions, product categories, industries — the reference's
 * "All products / SMEs / Enterprises"), the credentials, the testimonial
 * as a centred quote, and the classic sections to the closing "talk to
 * sales" band. The dark ground tokens do not invert, so the top of the
 * page is the same near-black in both schemes; the rest sits on the page.
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const look = statLookFor(settings);
  const { kicker, heading, lede } = heroCopy(settings);
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };
  const badges = certifications.data.slice(0, 4);

  const hero = (
    <>
      <section className="relative overflow-hidden bg-dark text-dark-ink">
        <Image src="/themes/summit/plexus.jpg" alt="" aria-hidden fill sizes="100vw" priority className="object-cover opacity-30" />
        <Backdrop variant={motionFor(settings).hero} tone="dark" size={56} mask="radial-gradient(ellipse 70% 60% at 50% 0%, #000 10%, transparent 75%)" />
        <Container className="relative flex flex-col items-center pt-16 pb-14 text-center lg:pt-24 lg:pb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-dark-line bg-dark-2 px-3.5 py-1.5 text-12 font-semibold text-brand-300">
            <i aria-hidden className="size-1.5 rounded-full bg-brand-300" />
            {kicker}
          </span>
          <h1 className="display-1 mt-6 max-w-[22ch] text-balance">{heading}</h1>
          <p className="lede mt-5 max-w-[60ch] text-dark-muted">{lede}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/contact" size="lg">Book a demo <IconArrowRight /></ButtonLink>
            <ButtonLink href="/solutions" variant="onDarkOutline" size="lg" className="border-white/25 text-white">See the solutions</ButtonLink>
          </div>
          {badges.length > 0 && (
            <ul className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-2 text-12-5 text-dark-muted" aria-label="Certifications">
              {badges.map((c) => (
                <li key={c.id} className="inline-flex items-center gap-1.5"><IconCheck className="size-3.5 text-brand-300" />{c.name}</li>
              ))}
            </ul>
          )}
          {hasSlider && (
            <div className="mt-12 w-full max-w-[1000px] overflow-hidden rounded-xl border border-dark-line bg-dark-2 p-2 shadow-3">
              <SliderFor slider={heroSlider!} aspect="aspect-[16/9]" sizes="(min-width: 1024px) 1000px, 100vw" priority className="rounded-lg" />
            </div>
          )}
        </Container>
      </section>
    </>
  );

  const statsRow = (
    <section className="section-y pb-0">
      <Container>
        <dl className={cn("stat-figures grid gap-4", stripColumns(stats.length, 2))} {...statFigures(look)}>
          {stats.map((s) => (
            <div key={s.label} data-card className="rounded-xl border border-line-strong bg-card p-6 text-center">
              <StatFigure stat={s} />
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );

  const catalogue = (
    <section className="section-y">
      <Container>
        <div className="text-center [&>div]:mx-auto">
          <SectionHeader kicker="Catalogue" title="Everything we design, sell and support" />
        </div>
        <CatalogueTabs groups={[
          { id: "solutions", label: "Solutions", items: solutions.data.slice(0, 8).map((s) => ({ slug: s.slug, title: s.title, summary: s.summary, icon: <IconTile name={s.icon} size="sm" />, href: `/solutions/${s.slug}` })) },
          { id: "products", label: "Products", items: categories.data.slice(0, 8).map((c) => ({ slug: c.slug, title: c.name, summary: c.description, icon: <IconTile name={c.icon} size="sm" />, href: `/products/${c.slug}` })) },
          { id: "industries", label: "Industries", items: industries.data.slice(0, 8).map((i) => ({ slug: i.slug, title: i.name, summary: i.summary, icon: <IconTile name={i.icon} size="sm" />, href: `/industries/${i.slug}` })) },
        ]} />
      </Container>
    </section>
  );

  const quote = (
    <section className="section-y bg-surface">
      <Container className="max-w-[860px] text-center">
        <p className="font-display text-[clamp(20px,2.4vw,28px)] leading-snug text-ink">“{testimonial.quote}”</p>
        <p className="mt-6 text-13-5 text-muted"><b className="text-ink">{testimonial.name}</b> · {testimonial.role}</p>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: hero },
    { id: "partners", node: <Partners items={brands.data} /> },
    // The statistics take the solutions slot: the solutions themselves are the first tab below.
    { id: "solutions", node: statsRow },
    { id: "categories", node: catalogue },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    // "Why us" is the testimonial here, a centred quote; the classic grid is not drawn.
    { id: "why", node: quote },
    { id: "clients", node: <TrustedBy items={clients.data} /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "web", node: <WebServices /> },
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
