import Link from "next/link";
import { NocPanel } from "@/components/home/noc-panel";
import {
  CaseStudies, Credentials, Industries, Partners, ProductCategories,
  Resources, SupportBand, TrustedBy, WebServices, WhyUs,
} from "@/components/home/sections";
import { Backdrop } from "@/components/ui/backdrop";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { SliderFor } from "@/components/ui/slider-for";
import { IconArrowRight } from "@/components/icons";
import { IconTile } from "@/components/ui/icon-tile";
import { heroStats } from "@/content/site";
import { motionFor } from "@/lib/motion-choices";
import { statPairs } from "@/lib/site-settings";
import { stripColumns } from "@/lib/strip-columns";
import { cn } from "@/lib/utils";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";

/**
 * Datacenter's front page: the operations floor.
 *
 * The hero is the dark band the header continues into — the words on the
 * left, and on the right the site's own NOC panel (the topology drawing
 * that was the classic hero's fallback) in a bezel, or the slider in the
 * same bezel when one is configured: a monitor on the wall either way.
 * Under it a readout strip: every statistic in the mono face with a
 * steady dot, the way a status page lists services. Then the solutions as
 * a **rack** — numbered rows with a code, an icon tile, a name and a
 * summary, each a link — because a list of what is installed is what an
 * engineer expects to read first. The rest of the classic sections follow
 * with the theme's CSS on them: they are the same evidence (partners,
 * clients, credentials, case studies, posts) whatever the room looks like.
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
  const SECTIONS = [
    { id: "hero", node: (
      <>
        {/* The hero: the dark band continues from the header. */}
        <section className="relative overflow-hidden bg-dark text-dark-ink">
          <Backdrop
            variant={motionFor(settings).hero}
            tone="dark"
            size={56}
            mask="radial-gradient(ellipse 90% 70% at 50% 0%, #000 20%, transparent 78%)"
          />
          <Container className="relative grid items-center gap-12 pt-14 pb-16 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pt-20 lg:pb-20 [&>*]:min-w-0">
            <div>
              <span className="font-mono text-12 font-semibold uppercase tracking-[.14em] text-brand-300">
                <span aria-hidden className="text-dark-muted">{"// "}</span>{kicker}
              </span>
              <h1 className="display-1 mt-5 max-w-[16ch] text-balance">{heading}</h1>
              <p className="lede mt-5 max-w-[50ch] text-dark-muted">{lede}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/contact" variant="onDark">
                  Talk to an engineer <IconArrowRight />
                </ButtonLink>
                <ButtonLink href="/solutions" variant="onDarkOutline" className="border-white/25 text-white">
                  Explore solutions
                </ButtonLink>
              </div>
            </div>
            {/* The monitor: a bezel around the slider or the NOC panel. */}
            <div className="rounded-xl border border-dark-line bg-dark-2 p-2 shadow-3">
              <div className="mb-2 flex items-center justify-between px-2 pt-1 font-mono text-11 text-dark-muted">
                <span>{hasSlider ? "display-01" : "noc-01"}</span>
                <span className="flex items-center gap-1.5"><i aria-hidden className="size-1.5 rounded-full bg-brand-300" />live</span>
              </div>
              {hasSlider ? (
                <SliderFor
                  slider={heroSlider!}
                  aspect="aspect-[16/10]"
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  priority
                  className="rounded-lg"
                />
              ) : (
                <NocPanel />
              )}
            </div>
          </Container>
        </section>

        {/* The readout strip. */}
        <section className="border-y border-dark-line bg-dark-2 text-dark-ink">
          <Container>
            <dl className={cn("grid divide-dark-line font-mono sm:divide-x", stripColumns(stats.length))}>
              {stats.map((s, i) => (
                <div key={s.label} className={cn("flex items-baseline gap-3 py-3 sm:py-4 sm:px-6", i === 0 && "sm:pl-0")}>
                  <i aria-hidden className="size-1.5 shrink-0 self-center rounded-full bg-brand-300" />
                  <dd className="whitespace-nowrap text-[22px] font-semibold leading-none tracking-[-.02em]">{s.value}</dd>
                  <dt className="text-12 uppercase tracking-[.08em] text-dark-muted">{s.label}</dt>
                </div>
              ))}
            </dl>
          </Container>
        </section>
      </>
    ) },
    { id: "solutions", node: (
      <>
        {/* The rack. */}
        <section className="section-y">
          <Container>
            <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
              <div>
                <span className="font-mono text-12 font-semibold uppercase tracking-[.14em] text-brand-ink"><span aria-hidden className="text-muted">{"// "}</span>solutions</span>
                <h2 className="display-3 mt-1">What we design, deploy and run</h2>
              </div>
              <Link href="/solutions" className="whitespace-nowrap font-mono text-12-5 font-semibold text-brand-ink hover:underline">all solutions →</Link>
            </div>
            <ol className="divide-y divide-line-strong">
              {solutions.data.slice(0, 6).map((s, i) => (
                <li key={s.slug}>
                  <Link
                    href={`/solutions/${s.slug}`}
                    className="group grid grid-cols-[auto_auto_1fr] items-center gap-4 py-4 transition-colors duration-(--duration-base) hover:bg-surface sm:gap-6 sm:px-3"
                  >
                    <span className="font-mono text-12 text-muted">SOL-{String(i + 1).padStart(2, "0")}</span>
                    <IconTile name={s.icon} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-16 font-semibold text-ink group-hover:text-brand-ink">{s.title}</span>
                      {s.summary && <span className="mt-0.5 block truncate text-13-5 text-muted">{s.summary}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Container>
        </section>
      </>
    ) },
    { id: "partners", node: <Partners items={brands.data} /> },
    // xl:grid-cols-4 — 12 is three full rows; nine left the last row one short.
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 12)} /> },
    { id: "why", node: <WhyUs /> },
    { id: "clients", node: <TrustedBy items={clients.data} /> },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "web", node: <WebServices /> },
    { id: "support", node: <SupportBand /> },
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
