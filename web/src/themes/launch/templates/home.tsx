import Image from "next/image";
import Link from "next/link";
import {
  CaseStudies, Credentials, Industries, Partners, ProductCategories,
  Resources, SupportBand, TrustedBy, WebServices, WhyUs,
} from "@/components/home/sections";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { IconTile } from "@/components/ui/icon-tile";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { SliderFor } from "@/components/ui/slider-for";
import { IconArrowRight } from "@/components/icons";
import { heroStats, supportStats } from "@/content/site";
import { motionFor } from "@/lib/motion-choices";
import { statPairs } from "@/lib/site-settings";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";

/**
 * Launch's front page: a bento grid.
 *
 * Twelve columns of rounded tiles on the page ground, unequal on purpose —
 * a bento reads as designed because the tiles are not all the same size.
 * The hero is the big tile (the words, the kicker as a chip, the two pill
 * buttons); beside it the picture tile holds the slider when one is
 * configured and the theme's own network render otherwise; under them the
 * four statistics are four small tiles on the brand wash; then a wide
 * support tile (the theme's second picture with a card of copy over its
 * foot) and a solutions tile listing six as chips with their identity
 * tiles. Every tile is `data-card` so the theme's CSS rounds it with the
 * rest. The classic sections follow the grid; the closing band is the
 * theme's own rounded panel.
 *
 * Words are never on a photograph: the support tile's copy sits on an
 * opaque `bg-card` panel over the picture, so the contrast is the card's.
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const heading = settings.hero_heading ?? "Technology infrastructure that keeps your business connected.";
  const lede = settings.hero_lede
    ?? "We design, deploy and support the networks, servers and security systems your operations run on — engineered properly the first time, then maintained by a support desk that actually answers.";
  const kicker = settings.hero_kicker ?? "Networking · Servers · Security · Surveillance";
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };

  const hero = (
    <section className="pt-6 pb-10 lg:pt-8 lg:pb-14">
      <Container>
        <div className="grid gap-4 lg:grid-cols-12">
          {/* The words. */}
          {/* `p-5` on a phone: at 320 the tile is 288px and `p-8` left 224 for the
              headline, whose longest word at display size was the grid track's
              min-content — every tile in the column ran 7px past the edge.
              `[overflow-wrap:anywhere]` is the guard behind it, for a heading an
              editor writes with a longer word still. */}
          <div data-card className="flex flex-col justify-center rounded-3xl border border-line-strong bg-card p-5 sm:p-8 lg:col-span-7 lg:p-12">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-12 font-semibold text-brand-ink">
              <i aria-hidden className="size-1.5 rounded-full bg-brand-500" />
              {kicker}
            </span>
            <h1 className="display-1 mt-6 max-w-[18ch] text-balance [overflow-wrap:anywhere]">{heading}</h1>
            <p className="lede mt-5 max-w-[52ch]">{lede}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/contact" size="lg">Talk to an engineer <IconArrowRight /></ButtonLink>
              <ButtonLink href="/solutions" variant="secondary" size="lg">Explore solutions</ButtonLink>
            </div>
          </div>

          {/* The picture. */}
          <div data-card className="relative min-h-[300px] overflow-hidden rounded-3xl border border-line-strong bg-surface-2 lg:col-span-5">
            {hasSlider ? (
              <SliderFor slider={heroSlider!} aspect="aspect-[4/5] lg:aspect-auto lg:h-full" sizes="(min-width: 1024px) 40vw, 100vw" priority className="h-full" />
            ) : (
              <Image src="/themes/launch/cubes.jpg" alt="" aria-hidden fill sizes="(min-width: 1024px) 40vw, 100vw" priority className="object-cover" />
            )}
          </div>

          {/* The statistics. */}
          {stats.map((s) => (
            <div key={s.label} data-card className="rounded-3xl bg-brand-50 p-6 lg:col-span-3">
              <span className="block font-display text-[34px] font-semibold leading-none tracking-[-.03em] text-brand-ink">{s.value}</span>
              <span className="mt-2 block text-13 font-medium text-ink-2">{s.label}</span>
            </div>
          ))}

          {/* The support desk. */}
          <div data-card className="relative min-h-[360px] overflow-hidden rounded-3xl border border-line-strong bg-surface-2 lg:col-span-6">
            <Image src="/themes/launch/desk.jpg" alt="" aria-hidden fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-line-strong bg-card p-5">
              <span className="text-11-5 font-semibold uppercase tracking-[.12em] text-brand-ink">Support</span>
              <h2 className="mt-1 text-19 font-semibold">A desk that answers, with an SLA clock running.</h2>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {supportStats.slice(0, 3).map((s) => (
                  <div key={s.label} className="flex items-baseline gap-1.5">
                    <dd className="font-display text-17 font-semibold">{s.value}</dd>
                    <dt className="text-12 text-muted">{s.label}</dt>
                  </div>
                ))}
              </dl>
              <Link href="/support" className="mt-3 inline-flex items-center gap-1.5 text-13 font-semibold text-brand-ink hover:underline">
                How support works <IconArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>

          {/* The solutions. */}
          <div data-card className="rounded-3xl border border-line-strong bg-card p-6 lg:col-span-6 lg:p-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <span className="text-11-5 font-semibold uppercase tracking-[.12em] text-brand-ink">Solutions</span>
                <h2 className="mt-1 text-22 font-semibold tracking-[-.02em]">What we design, deploy and run</h2>
              </div>
              <Link href="/solutions" className="whitespace-nowrap text-13 font-semibold text-brand-ink hover:underline">All solutions →</Link>
            </div>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {solutions.data.slice(0, 6).map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/solutions/${s.slug}`}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition-colors duration-(--duration-base) hover:border-brand-300 hover:bg-brand-50"
                  >
                    <IconTile name={s.icon} size="sm" />
                    <span className="min-w-0 truncate text-14 font-semibold text-ink">{s.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: hero },
    { id: "partners", node: <Partners items={brands.data} /> },
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 12)} /> },
    { id: "why", node: <WhyUs /> },
    { id: "clients", node: <TrustedBy items={clients.data} /> },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "web", node: <WebServices /> },
    { id: "support", node: <SupportBand /> },
    { id: "cases", node: <CaseStudies items={caseStudies.data.slice(0, 6)} /> },
    { id: "resources", node: <Resources items={posts.data.slice(0, 4)} /> },
    { id: "cta", node: <CtaBand tone="brand" size="lg" backdrop={motionFor(settings).hero} /> },
  ];

  return (
    <>
      {orderSections(SECTIONS, options).map((s) => (
        <Bg key={s.id} id={s.id} {...bg}>{s.node}</Bg>
      ))}
    </>
  );
}
