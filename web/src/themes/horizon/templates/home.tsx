import Image from "next/image";
import Link from "next/link";
import {
  CaseStudies, Credentials, Industries, Partners, ProductCategories, Resources, TrustedBy,
} from "@/components/home/sections";
import { Reviews } from "@/components/home/reviews";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { IconTile } from "@/components/ui/icon-tile";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { SliderFor } from "@/components/ui/slider-for";
import { StatFigure, statFigures } from "@/components/ui/stat";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { amcInclusions, heroStats, testimonial } from "@/content/site";
import { statLookFor } from "@/lib/stat-look";
import { heroCopy, statPairs } from "@/lib/site-settings";
import { stripColumns } from "@/lib/strip-columns";
import { cn } from "@/lib/utils";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";

/**
 * Horizon's front page: the hosting company's sequence.
 *
 * Modelled on i2k2.com. A **full-width banner** first — the slider edge to
 * edge when there is one (its own captions, its own arrows), otherwise the
 * theme's data-centre picture with the kicker, the headline, the lede and
 * one "Book a demo" on an opaque `card` panel over its left half, so the
 * words are ink on card whatever the picture. Then **four service cards**
 * (the first four solutions, each with its identity icon, a line and
 * "Read more"), the statistics as a band on the secondary colour, the
 * client logos, **why choose us** as a bullet list beside the engineer
 * picture, two featured case studies, the testimonial, the partner logos,
 * the posts, and an **enquiry form on the front page** — the reference's
 * lead-capture block — above the closing band.
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const look = statLookFor(settings);
  const { kicker, heading, lede } = heroCopy(settings);
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };

  const hero = hasSlider ? (
    <section className="bg-dark">
      <SliderFor slider={heroSlider!} aspect="aspect-[16/9] lg:aspect-[21/8]" sizes="100vw" priority className="rounded-none border-0" />
    </section>
  ) : (
    <section className="relative overflow-hidden bg-dark">
      <Image src="/themes/horizon/walk.jpg" alt="" aria-hidden fill sizes="100vw" priority className="object-cover" />
      <Container className="relative py-12 lg:py-20">
        <div className="max-w-[640px] rounded-lg border border-line-strong bg-card p-7 shadow-3 lg:p-10">
          <span className="text-12 font-semibold uppercase tracking-[.13em] text-secondary-ink">{kicker}</span>
          <h1 className="display-1 mt-3 text-balance">{heading}</h1>
          <p className="lede mt-4">{lede}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/contact" size="lg">Book a demo <IconArrowRight /></ButtonLink>
            <ButtonLink href="/solutions" variant="secondary" size="lg">Our services</ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );

  const services = (
    <section className="section-y">
      <Container>
        <SectionHeader kicker="Services" title="What we run for you" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {solutions.data.slice(0, 4).map((s) => (
            <article key={s.slug} data-card className="flex flex-col rounded-lg border border-line-strong bg-card p-6 transition-shadow duration-(--duration-base) hover:shadow-2">
              <IconTile name={s.icon} />
              <h3 className="mt-4 text-17 font-semibold">{s.title}</h3>
              {s.summary && <p className="mt-2 text-14 leading-relaxed text-muted">{s.summary}</p>}
              <Link href={`/solutions/${s.slug}`} className="mt-auto inline-flex items-center gap-1.5 pt-5 text-12-5 font-bold uppercase tracking-[.06em] text-secondary-ink hover:underline">
                Read more <IconArrowRight className="size-3.5" />
              </Link>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );

  const band = (
    <section className="bg-secondary-800 text-white">
      <Container>
        <dl className={cn("stat-figures grid divide-white/15 sm:divide-x", stripColumns(stats.length, 2))} {...statFigures(look, true)}>
          {stats.map((s) => (
            <div key={s.label} className="py-8 text-center">
              <StatFigure stat={s} onDark labelClassName="text-[rgba(255,255,255,.78)]" />
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );

  const why = (
    <section className="section-y bg-surface">
      <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16 [&>*]:min-w-0">
        <div>
          <SectionHeader kicker="Why choose us" title="Skill, scale and someone who answers" className="mb-6" />
          <ul className="grid gap-3 sm:grid-cols-2">
            {amcInclusions.slice(0, 6).map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-14-5 text-ink-2">
                <IconCheck className="mt-0.5 size-4 shrink-0 text-secondary-ink" />
                {line}
              </li>
            ))}
          </ul>
          <blockquote className="mt-8 border-l-4 border-accent-500 pl-4 text-14-5 leading-relaxed text-muted">
            “{testimonial.quote}”
            <footer className="mt-2 text-13 font-semibold text-ink">{testimonial.name} · {testimonial.role}</footer>
          </blockquote>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line-strong bg-surface-2">
          <Image src="/themes/horizon/laptop.jpg" alt="" aria-hidden fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
        </div>
      </Container>
    </section>
  );

  const enquiry = (
    <section className="section-y">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16 [&>*]:min-w-0">
        <div>
          <SectionHeader kicker="Get in touch" title="Tell us what you are running" className="mb-4" />
          <p className="lede">A site visit and an honest infrastructure audit — no obligation. You get the findings in writing whether or not you work with us.</p>
        </div>
        <div className="rounded-lg border border-line-strong bg-card p-6 lg:p-8">
          <EnquiryForm source="home" compact />
        </div>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: hero },
    { id: "solutions", node: services },
    // The slots keep their ids for the console's rows; what each carries here:
    // `why` the statistics band, `web` the why-choose-us block, `support` the enquiry form.
    { id: "why", node: band },
    { id: "clients", node: <TrustedBy items={clients.data} /> },
    { id: "web", node: why },
    { id: "cases", node: <CaseStudies items={caseStudies.data.slice(0, 2)} /> },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "partners", node: <Partners items={brands.data} /> },
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 8)} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "resources", node: <Resources items={posts.data.slice(0, 3)} /> },
    { id: "support", node: enquiry },
    { id: "cta", node: <CtaBand tone="brand" className="pt-0" /> },
  ];

  return (
    <>
      {orderSections(SECTIONS, options).map((s) => (
        <Bg key={s.id} id={s.id} {...bg}>{s.node}</Bg>
      ))}
    </>
  );
}
