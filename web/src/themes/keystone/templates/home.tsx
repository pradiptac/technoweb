import Image from "next/image";
import {
  CaseStudies, Industries, Partners, ProductCategories, Resources, SupportBand, TrustedBy, WebServices, WhyUs,
} from "@/components/home/sections";
import { NocPanel } from "@/components/home/noc-panel";
import { Reviews } from "@/components/home/reviews";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { SliderFor } from "@/components/ui/slider-for";
import { StatFigure, statFigures } from "@/components/ui/stat";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { ServiceTabs } from "@/themes/enterprise/service-tabs";
import { heroStats, testimonial } from "@/content/site";
import { statLookFor } from "@/lib/stat-look";
import { heroCopy, statPairs } from "@/lib/site-settings";
import { stripColumns } from "@/lib/strip-columns";
import { cn } from "@/lib/utils";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";
import { GradientHeading } from "../gradient-heading";

const PICTURES = ["/themes/keystone/racks.jpg", "/themes/keystone/hub.jpg"] as const;

/**
 * Keystone's front page, after truenas.com.
 *
 * Everything at the top is on the centre line: the headline, heavy, its
 * closing words through the brand-to-accent gradient (`GradientHeading`,
 * which keeps a solid-ink copy for the audit and the screen reader); the
 * lede; two pills; then the product shown big — the slider in a frame
 * that glows in the brand colour, or the NOC panel — the reference's
 * dashboard screenshot. Then the statistics as a row of figures, "what is
 * Technoware" as the solutions in a tab strip beside a photograph, the
 * partners on the brand wash, the full-bleed brand band holding one white
 * rounded card with the customer's words and the certifications, and the
 * classic sections to the dark rounded closing card.
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
    <section className="relative overflow-hidden">
      <Container className="relative flex flex-col items-center pt-14 pb-10 text-center lg:pt-20 lg:pb-14">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-12 font-semibold text-brand-ink">{kicker}</span>
        <GradientHeading as="h1" className="display-1 mt-6 max-w-[24ch] text-balance [overflow-wrap:anywhere]" text={heading} />
        <p className="lede mt-5 max-w-[62ch] text-ink-2">{lede}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/contact" size="lg">Get a quote <IconArrowRight /></ButtonLink>
          <ButtonLink href="/solutions" variant="secondary" size="lg">Get in touch</ButtonLink>
        </div>
        <div className="keystone-frame mt-12 w-full max-w-[1180px] overflow-hidden rounded-2xl border border-line-strong bg-dark p-2">
          {hasSlider ? (
            <SliderFor slider={heroSlider!} aspect="aspect-[16/9]" sizes="(min-width: 1280px) 1180px, 100vw" priority className="rounded-xl" />
          ) : (
            <div className="overflow-hidden rounded-xl bg-dark-2"><NocPanel /></div>
          )}
        </div>
      </Container>
    </section>
  );

  const figures = (
    <section className="pb-4">
      <Container>
        <dl className={cn("stat-figures grid gap-6 rounded-2xl border border-line-strong bg-card p-6 text-center lg:p-8", stripColumns(stats.length, 2))} {...statFigures(look)}>
          {stats.map((s) => (
            <div key={s.label} data-card className="rounded-none border-0 bg-transparent p-0">
              <StatFigure stat={s} />
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );

  const what = (
    <section className="section-y-lg">
      <Container>
        <div className="text-center [&>div]:mx-auto">
          <SectionHeader
            kicker="Solutions"
            title="What is Technoware?"
            lede="An engineering firm that designs, installs and keeps running the network, server, storage and security estate a business runs on."
          />
        </div>
        <ServiceTabs
          label="Solutions"
          pictures={PICTURES}
          items={solutions.data.slice(0, 6).map((s) => ({ slug: s.slug, title: s.title, summary: s.summary, href: `/solutions/${s.slug}` }))}
        />
      </Container>
    </section>
  );

  const band = (
    <section className="bg-brand-600 py-12 text-brand-on lg:py-16">
      <Container>
        <div className="grid gap-8 rounded-3xl bg-card p-7 text-ink lg:grid-cols-[1fr_1.2fr] lg:gap-14 lg:p-12">
          <div className="min-w-0">
            <GradientHeading as="h2" className="display-2 text-balance" text="Industry-leading enterprise support" />
            {certifications.data.length > 0 && (
              <ul className="mt-7 grid gap-3 sm:grid-cols-2" aria-label="Certifications">
                {certifications.data.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="relative block size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
                      {c.image ? <Image src={c.image} alt={c.image_alt} fill sizes="48px" className="object-cover" /> : <IconCheck className="m-auto size-5 text-brand-ink" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-14 font-semibold">{c.name}</span>
                      {c.issuer && <span className="block truncate text-12-5 text-muted">{c.issuer}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ButtonLink href="/certifications" variant="secondary" size="sm" className="mt-7">Read the credentials <IconArrowRight /></ButtonLink>
          </div>
          <figure className="flex flex-col justify-center border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0">
            <blockquote className="font-display text-[clamp(18px,2vw,24px)] leading-snug text-ink">“{testimonial.quote}”</blockquote>
            <figcaption className="mt-5 text-13-5 text-muted">— <b className="font-semibold text-ink">{testimonial.name}</b>, {testimonial.role}</figcaption>
          </figure>
        </div>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: <>{hero}{figures}</> },
    { id: "solutions", node: what },
    { id: "partners", node: <Partners items={brands.data} mode="deal" /> },
    { id: "credentials", node: band },
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 8)} /> },
    { id: "why", node: <WhyUs /> },
    { id: "clients", node: <TrustedBy items={clients.data} mode="lens" /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "web", node: <WebServices /> },
    { id: "support", node: <SupportBand settings={settings} /> },
    { id: "cases", node: <CaseStudies items={caseStudies.data.slice(0, 6)} /> },
    { id: "resources", node: <Resources items={posts.data.slice(0, 4)} /> },
    { id: "cta", node: <CtaBand tone="brand" size="lg" /> },
  ];

  return (
    <>
      {orderSections(SECTIONS, options).map((s) => (
        <Bg key={s.id} id={s.id} {...bg}>{s.node}</Bg>
      ))}
    </>
  );
}
