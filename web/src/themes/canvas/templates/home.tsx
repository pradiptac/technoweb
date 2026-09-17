import Link from "next/link";
import { NocPanel } from "@/components/home/noc-panel";
import {
  CaseStudies, Credentials, Industries, Partners, Resources, SupportBand, TrustedBy, WebServices,
} from "@/components/home/sections";
import { Reviews } from "@/components/home/reviews";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
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
 * Canvas's front page, from the design document's components.
 *
 * `hero-band`: a 6-6 grid on the canvas, the h1 (serif, 400), the
 * sub-headline and the button row on the left; on the right the
 * `product-mockup-card-dark` — a dark navy card with a title bar of
 * small labels holding the site's own NOC drawing, or the slider, as the
 * "product chrome" (the document: show real product, not an
 * illustration of one). Then the statistics as `badge-pill`s in a row;
 * `feature-card`s three-up on the darker cream (`surface-2`) with an
 * icon, a title and a line — the first six solutions; the support desk
 * as the dark band (the cream-to-dark rhythm the document calls the
 * brand's pacing); `model-comparison-card`s for the product categories —
 * canvas with a hairline, a name, a blurb, a text link; and the classic
 * sections on to the coral `callout-card` close. Coral is the brand fill,
 * so it appears only where the document allows it: the primary buttons
 * and the closing band.
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const look = statLookFor(settings);
  const { kicker, heading, lede } = heroCopy(settings);
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };

  const hero = (
    <section className="pt-14 pb-16 lg:pt-24 lg:pb-24">
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16 [&>*]:min-w-0">
        <div>
          <span className="inline-block rounded-full bg-surface-2 px-3 py-1 text-13 font-medium text-ink">{kicker}</span>
          <h1 className="display-1 mt-6 text-balance">{heading}</h1>
          <p className="lede mt-6">{lede}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/contact">Talk to an engineer <IconArrowRight /></ButtonLink>
            <ButtonLink href="/solutions" variant="secondary">See the solutions</ButtonLink>
          </div>
        </div>
        {/* The product mockup card: dark, rounded 16, a title bar of labels. */}
        <div data-card className="overflow-hidden rounded-2xl border border-dark-line bg-dark text-dark-ink">
          <div className="flex items-center gap-3 border-b border-dark-line px-4 py-2.5 text-12 text-dark-muted">
            <span className="font-medium text-dark-ink">{hasSlider ? "Overview" : "Network"}</span>
            <span>Status</span>
            <span>Tickets</span>
            <span className="ml-auto inline-flex items-center gap-1.5"><i aria-hidden className="size-1.5 rounded-full bg-brand-300" />live</span>
          </div>
          <div className="p-3">
            {hasSlider ? (
              <SliderFor slider={heroSlider!} aspect="aspect-[16/10]" sizes="(min-width: 1024px) 50vw, 100vw" priority className="rounded-lg" />
            ) : (
              <NocPanel />
            )}
          </div>
        </div>
      </Container>
    </section>
  );

  const pills = (
    <section className="pb-6">
      <Container>
        <dl className={cn("stat-figures grid gap-3", stripColumns(stats.length, 2))} {...statFigures(look)}>
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-card px-5 py-4">
              <StatFigure stat={s} inline />
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );

  const features = (
    <section className="section-y">
      <Container>
        <SectionHeader kicker="What we do" title="Infrastructure, engineered properly the first time" />
        <div className="grid gap-5 md:grid-cols-3">
          {solutions.data.slice(0, 6).map((s) => (
            <Link key={s.slug} href={`/solutions/${s.slug}`} data-card className="flex flex-col rounded-xl bg-surface-2 p-8 transition-colors duration-(--duration-base) hover:bg-surface">
              <IconTile name={s.icon} size="sm" />
              <h3 className="mt-5 text-19">{s.title}</h3>
              {s.summary && <p className="mt-2 text-15 leading-relaxed text-ink-2">{s.summary}</p>}
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );

  const compare = (
    <section className="section-y">
      <Container>
        <SectionHeader kicker="Which problem are you up against?" title="Hardware by what it is for" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {categories.data.slice(0, 8).map((c) => (
            <div key={c.slug} data-card className="flex flex-col rounded-xl border border-line-strong bg-card p-8">
              <h3 className="text-19">{c.name}</h3>
              {c.description && <p className="mt-2 text-14-5 leading-relaxed text-ink-2">{c.description}</p>}
              <Link href={`/products/${c.slug}`} className="mt-auto inline-flex items-center gap-1.5 pt-5 text-14 font-medium text-brand-ink hover:underline">
                Learn more <IconArrowRight className="size-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: hero },
    // `why` carries the statistic pills and `categories` the comparison cards;
    // the classic grids for both are not drawn.
    { id: "why", node: pills },
    { id: "solutions", node: features },
    { id: "support", node: <SupportBand settings={settings} /> },
    { id: "categories", node: compare },
    { id: "partners", node: <Partners items={brands.data} /> },
    { id: "clients", node: <TrustedBy items={clients.data} /> },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "web", node: <WebServices /> },
    { id: "cases", node: <CaseStudies items={caseStudies.data.slice(0, 3)} /> },
    { id: "resources", node: <Resources items={posts.data.slice(0, 3)} /> },
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
