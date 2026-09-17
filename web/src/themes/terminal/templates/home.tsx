import Link from "next/link";
import { NocPanel } from "@/components/home/noc-panel";
import {
  CaseStudies, Credentials, Industries, Partners, ProductCategories,
  Resources, SupportBand, TrustedBy, WebServices, WhyUs,
} from "@/components/home/sections";
import { Reviews } from "@/components/home/reviews";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { IconTile } from "@/components/ui/icon-tile";
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

/**
 * Terminal's front page: a shell session.
 *
 * The hero is two windows side by side, each a bordered box with a title
 * bar of three discs and a name. The first is the prompt: `$ technoware
 * --status`, the kicker as a `#` comment, the headline in the mono display
 * face, the lede as a quoted line, and two bracketed buttons. The second
 * holds the slider when one is configured and the site's own NOC drawing
 * otherwise (`$ open display-01`). Under them the statistics as one
 * bordered row of cells. Then the solutions as a **table** — `$ ls
 * solutions/` — index, name, summary, an arrow — where every other theme
 * draws cards, because a listing is what a terminal shows you. The rest of
 * the classic sections follow with the theme's CSS on them.
 */
function Window({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col border border-line-strong bg-card", className)}>
      <div className="flex items-center gap-2 border-b border-line-strong px-3.5 py-2 font-mono text-11-5 text-muted">
        <span aria-hidden className="flex gap-1.5">
          <i className="size-2.5 rounded-full bg-err-fill/80" />
          <i className="size-2.5 rounded-full bg-warn-fill/80" />
          <i className="size-2.5 rounded-full bg-ok-fill/80" />
        </span>
        <span className="ml-1">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const look = statLookFor(settings);
  const { kicker, heading, lede } = heroCopy(settings);
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };

  const hero = (
    <section className="pt-8 pb-12 lg:pt-12 lg:pb-16">
      <Container>
        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-stretch [&>*]:min-w-0">
          <Window title="technoware — bash">
            <div className="flex flex-1 flex-col justify-center p-6 font-mono lg:p-9">
              <p className="text-13 text-muted"><span className="text-brand-ink">$</span> technoware --status</p>
              <p className="mt-3 text-12-5 text-muted"><span aria-hidden>{"# "}</span>{kicker}</p>
              <h1 className="display-1 mt-4 text-balance [overflow-wrap:anywhere]">{heading}</h1>
              <p className="mt-5 text-15 leading-relaxed text-ink-2"><span aria-hidden className="text-faint">{"> "}</span>{lede}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/contact">talk to an engineer <IconArrowRight /></ButtonLink>
                <ButtonLink href="/solutions" variant="secondary">explore solutions</ButtonLink>
              </div>
              <p aria-hidden className="mt-6 text-13 text-muted"><span className="text-brand-ink">$</span> <span className="motion-safe:animate-pulse">▍</span></p>
            </div>
          </Window>

          <Window title={hasSlider ? "$ open display-01" : "$ open noc-01"} className="min-h-[320px]">
            <div className="relative flex-1 bg-dark p-2">
              {hasSlider ? (
                <SliderFor slider={heroSlider!} aspect="aspect-[16/10] lg:aspect-auto lg:h-full" sizes="(min-width: 1024px) 45vw, 100vw" priority className="h-full rounded-none" />
              ) : (
                <NocPanel />
              )}
            </div>
          </Window>
        </div>

        {/* The statistics: one bordered row of cells. */}
        <dl className={cn("stat-figures mt-5 grid border border-line-strong bg-card font-mono divide-line-strong sm:divide-x", stripColumns(stats.length, 2))} {...statFigures(look)}>
          {stats.map((s) => (
            <div key={s.label} className="border-b border-line-strong p-5 sm:border-b-0">
              <StatFigure stat={s} labelClassName="font-mono text-12" />
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );

  const list = (
    <section className="section-y">
      <Container>
        <p className="font-mono text-13 text-muted"><span className="text-brand-ink">$</span> ls solutions/</p>
        <h2 className="display-2 mt-2">What we design, deploy and run</h2>
        {/* `relative`: the two `sr-only` column headings are absolutely positioned,
            and without a positioned scroll box their containing block is the page —
            measured at 360px as a 1px box 300px past the edge, which is the whole of
            the zero-tolerance overflow check. */}
        <div className="relative mt-6 overflow-x-auto border border-line-strong">
          <table className="w-full min-w-[640px] border-collapse font-mono text-13-5">
            <thead>
              <tr className="border-b border-line-strong bg-surface text-left text-11-5 uppercase tracking-[.08em] text-muted">
                <th scope="col" className="w-16 px-4 py-2.5 font-medium">#</th>
                <th scope="col" className="w-12 px-2 py-2.5 font-medium"><span className="sr-only">Icon</span></th>
                <th scope="col" className="px-4 py-2.5 font-medium">name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">summary</th>
                <th scope="col" className="w-12 px-4 py-2.5 font-medium"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {solutions.data.slice(0, 8).map((s, i) => (
                <tr key={s.slug} className="border-b border-line last:border-b-0 transition-colors duration-(--duration-base) hover:bg-brand-50">
                  <td className="px-4 py-3 text-muted">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-2 py-2"><IconTile name={s.icon} size="sm" /></td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    <Link href={`/solutions/${s.slug}`} className="hover:text-brand-ink hover:underline">{s.title}</Link>
                  </td>
                  <td className="max-w-[46ch] truncate px-4 py-3 font-sans text-13-5 text-muted">{s.summary}</td>
                  <td className="px-4 py-3 text-brand-ink" aria-hidden>→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link href="/solutions" className="mt-4 inline-block font-mono text-13 text-brand-ink hover:underline">$ cd solutions/ →</Link>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: hero },
    { id: "solutions", node: list },
    { id: "partners", node: <Partners items={brands.data} /> },
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 12)} /> },
    { id: "why", node: <WhyUs /> },
    { id: "clients", node: <TrustedBy items={clients.data} /> },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
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
