import { homeBlockSections } from "@/components/blocks/home-block-sections";
import Image from "next/image";
import { focalStyle } from "@/lib/focal";
import Link from "next/link";
import {
  CaseStudies, Credentials, Industries, Partners, ProductCategories, Resources, SupportBand, TrustedBy, Services,
} from "@/components/home/sections";
import { Reviews } from "@/components/home/reviews";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { IconTile } from "@/components/ui/icon-tile";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { Slider } from "@/components/ui/slider";
import { StatFigure, statFigures } from "@/components/ui/stat";
import { IconArrowRight } from "@/components/icons";
import { amcInclusions, heroStats, testimonial } from "@/content/site";
import { statLookFor } from "@/lib/stat-look";
import { heroCopy, statPairs } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";
import { brandName } from "@/lib/brand";

const OFFICE = "/themes/vantage/office.jpg";
const NOC = "/themes/vantage/noc.jpg";

/**
 * Vantage's front page, after technerd.altisinfonet.in.
 *
 * The hero *is* the slider: full-bleed to both edges and exactly the
 * window's height (`100svh`, from the very top — the info bar and the pill
 * sit on it; the client, 2026-09-28), the slide's own words on it, and in the bottom-right
 * corner the reference's white notch — the slide counter and the arrows,
 * which are the `Slider`'s own controls moved there by `theme.css`. With
 * no slider configured the same band shows the theme's office photograph
 * under a dark gradient with the site's hero copy, the kicker with its
 * accent dot, the words bottom-left and the lede and button bottom-right.
 * The band is `bg-dark` behind the picture and the words sit on a
 * gradient whose lowest stop is that opaque dark, so the audit grades them
 * against what they are really on. The header's glass state keys on the
 * `data-vantage-dark` this band carries.
 *
 * Under it: the solutions as photograph cards (a solution's own hero
 * picture, or the theme's), a split "about" with the statistics two by two,
 * the customer's words on an opaque panel over the darkened NOC photograph,
 * and the classic sections to the closing band.
 */
export function Home({
  settings, solutions, categories, industries, services: allServices, serviceCategories, caseStudies, posts, brands, clients, certifications, heroSlider, blocks, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const look = statLookFor(settings);
  const { kicker, heading, lede } = heroCopy(settings);
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };

  const hero = (
    <section data-vantage-dark className="vantage-hero relative overflow-hidden bg-dark text-white">
      {hasSlider ? (
        <>
          {/*
            `Slider`, not `SliderFor`: a full-bleed hero is the banner
            slider by definition — a fan of cards or a stack is a well
            that sits *in* a page, and the notch below is built on the
            banner's own controls. The slides carry their captions; the
            page's heading is still the site's, spoken rather than shown,
            because a slide's caption is a picture's caption and a page
            has to have exactly one `h1` whatever the editor put on the
            slides.
          */}
          <h1 className="sr-only">{heading}</h1>
          <Slider
            slider={heroSlider!}
            aspect="h-svh min-h-[360px]"
            sizes="100vw"
            priority
            className="rounded-none border-0 bg-dark"
          />
        </>
      ) : (
        <div className="relative flex min-h-svh flex-col justify-end">
          <Image src={OFFICE} alt="" aria-hidden fill sizes="100vw" priority className="object-cover" />
          <div aria-hidden className="absolute inset-0 bg-linear-to-t from-dark via-dark/70 to-dark/20" />
          <Container className="relative grid gap-6 pt-40 pb-16 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:gap-12 lg:pb-20">
            <div className="min-w-0">
              <p className="flex items-center gap-2.5 text-15 font-semibold text-accent-300">
                <i aria-hidden className="size-2 rounded-full bg-accent-400" />
                {kicker}
              </p>
              <h1 className="display-1 mt-4 text-balance [overflow-wrap:anywhere]">{heading}</h1>
            </div>
            <div className="min-w-0 lg:pb-2">
              <p className="max-w-[46ch] text-15 leading-relaxed text-[rgba(255,255,255,.85)]">{lede}</p>
              <div className="mt-5">
                <ButtonLink href="/solutions" className="bg-accent-600 text-accent-on hover:bg-accent-700">Know more <IconArrowRight /></ButtonLink>
              </div>
            </div>
          </Container>
        </div>
      )}
    </section>
  );

  const services = (
    <section className="section-y-lg">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader kicker="Our services" title="What we design, deploy and keep running" className="mb-0" />
          <ButtonLink href="/solutions" variant="secondary" size="sm" className="mb-2">View all <IconArrowRight /></ButtonLink>
        </div>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {solutions.data.slice(0, 6).map((s, i) => (
            <li key={s.slug}>
              <Link href={`/solutions/${s.slug}`} data-card className="group block overflow-hidden rounded-2xl border border-line-strong bg-card">
                <span className="relative block aspect-[4/3] overflow-hidden bg-surface-2">
                  <Image
                    src={s.hero_image ?? (i % 2 ? NOC : OFFICE)}
                    alt={s.hero_image ? (s.hero_image_alt ?? "") : ""}
                    aria-hidden={!s.hero_image || undefined}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-[scale] duration-(--duration-slow) ease-brand motion-safe:group-hover:scale-[1.04]"
                    style={s.hero_image ? focalStyle(s.hero_image_focus) : undefined}
                  />
                </span>
                <span className="flex items-start gap-3 p-5">
                  <IconTile name={s.icon} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-17 font-semibold leading-snug text-ink">{s.title}</span>
                    {s.summary && <span className="mt-1 line-clamp-2 block text-13-5 text-muted">{s.summary}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );

  const about = (
    <section className="section-y-lg bg-surface">
      <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
          <Image src={NOC} alt="" aria-hidden fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2.5 text-14 font-semibold text-accent-ink">
            <i aria-hidden className="size-2 rounded-full bg-accent-500" />About us
          </p>
          <h2 className="display-2 mt-3">Engineers first, and the engineering shows.</h2>
          <p className="lede mt-4">{settings.tagline ?? "Hardware, network and security infrastructure — designed, deployed and supported by engineers."}</p>
          <dl className={cn("stat-figures mt-8 grid grid-cols-2 gap-6")} {...statFigures(look)}>
            {stats.slice(0, 4).map((s) => (
              <div key={s.label} className="border-l-2 border-accent-500 pl-4">
                <StatFigure stat={s} />
              </div>
            ))}
          </dl>
          <ul className="mt-8 grid gap-2 sm:grid-cols-2">
            {amcInclusions.slice(0, 4).map((w) => (
              <li key={w} className="flex items-center gap-2.5 text-14 text-ink">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-500 text-accent-on"><IconArrowRight className="size-3" /></span>
                {w}
              </li>
            ))}
          </ul>
          <div className="mt-8"><ButtonLink href="/about">About {settings.company_name ?? brandName()} <IconArrowRight /></ButtonLink></div>
        </div>
      </Container>
    </section>
  );

  const quote = (
    <section className="relative overflow-hidden bg-dark py-20 text-dark-ink lg:py-28">
      <Image src={NOC} alt="" aria-hidden fill sizes="100vw" className="object-cover opacity-40" />
      <Container className="relative">
        <figure className="mx-auto max-w-[760px] rounded-2xl bg-dark-2 p-8 text-center lg:p-12">
          <span aria-hidden className="font-display text-[64px] leading-none text-accent-400">“</span>
          <blockquote className="font-display text-[clamp(20px,2.4vw,28px)] leading-snug text-white">{testimonial.quote}</blockquote>
          <figcaption className="mt-6 text-13-5 text-dark-muted"><b className="font-semibold text-white">{testimonial.name}</b> · {testimonial.role}</figcaption>
        </figure>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: hero },
    { id: "solutions", node: services },
    { id: "why", node: about },
    { id: "partners", node: <Partners items={brands.data} mode="bob" /> },
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 8)} /> },
    { id: "clients", node: <>{quote}<TrustedBy items={clients.data} mode="parallax" /></> },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "web", node: <Services services={allServices.data} categories={serviceCategories.data} /> },
    { id: "support", node: <SupportBand settings={settings} /> },
    { id: "cases", node: <CaseStudies items={caseStudies.data.slice(0, 6)} /> },
    { id: "resources", node: <Resources items={posts.data.slice(0, 3)} /> },
    ...homeBlockSections(blocks),
    { id: "cta", node: <CtaBand tone="accent" size="lg" /> },
  ];

  return (
    <>
      {orderSections(SECTIONS, options).map((s, i) => (
        <Bg key={s.id} id={s.id} index={i} {...bg}>{s.node}</Bg>
      ))}
    </>
  );
}
