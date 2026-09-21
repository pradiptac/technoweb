import Link from "next/link";
import {
  CaseStudies, Credentials, Industries, Partners, Resources, Solutions, SupportBand, TrustedBy, WebServices, WhyUs,
} from "@/components/home/sections";
import { NocPanel } from "@/components/home/noc-panel";
import { Reviews } from "@/components/home/reviews";
import { Backdrop } from "@/components/ui/backdrop";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { IconTile } from "@/components/ui/icon-tile";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { SliderFor } from "@/components/ui/slider-for";
import { StatValue } from "@/components/ui/stat-value";
import { statFigures } from "@/components/ui/stat";
import { IconArrowRight } from "@/components/icons";
import { heroStats, testimonial } from "@/content/site";
import { motionFor } from "@/lib/motion-choices";
import { statLookFor } from "@/lib/stat-look";
import { heroCopy, statPairs } from "@/lib/site-settings";
import { stripColumns } from "@/lib/strip-columns";
import { cn } from "@/lib/utils";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";

/**
 * Sentinel's front page, after eset.com.
 *
 * The top is dark and stays dark in both schemes (the dark ground tokens
 * do not invert): the hero's words on the left in the light display face
 * with the slider — or the NOC panel — in a glowing frame on the right;
 * under them the reference's two audience cards, "for the business" and
 * "for the desk", each a glow-outlined panel; then the statistics as huge
 * thin numerals. Below the seam the page is on its own ground: the
 * partners, the product categories as outlined cards with a count (the
 * reference's product cards, minus the prices this catalogue does not
 * carry), the customer's words set large and light, the credentials, and
 * the classic sections to the closing band. Words are never on a
 * photograph.
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const look = statLookFor(settings);
  const { kicker, heading, lede } = heroCopy(settings);
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };

  const audiences = [
    { href: "/solutions", title: "For the business", body: "Networks, servers, storage and security — designed, deployed and supported by the engineers who answer the phone.", cta: "Solutions" },
    { href: "/store", title: "For the desk", body: "Firewalls, switches, access points and licences from the brands we install, priced and in stock.", cta: "Shop hardware" },
  ];

  const hero = (
    <section className="relative overflow-hidden bg-dark text-dark-ink">
      <Backdrop variant={motionFor(settings).hero} tone="dark" size={64} mask="radial-gradient(ellipse 60% 70% at 80% 30%, #000 10%, transparent 70%)" />
      {/* The glow behind the frame: a brand radial at low alpha, which changes no computed colour. */}
      <div aria-hidden className="pointer-events-none absolute -right-40 top-10 size-[640px] rounded-full bg-brand-500/20 blur-[120px]" />
      <Container className="relative pt-14 pb-12 lg:pt-20 lg:pb-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div className="min-w-0">
            <p className="flex items-center gap-2.5 text-13 text-brand-300">
              <i aria-hidden className="sentinel-dot size-2 rounded-full bg-brand-300" />
              {kicker}
            </p>
            <h1 className="display-1 mt-5 text-balance [overflow-wrap:anywhere]">{heading}</h1>
            <p className="lede mt-5 max-w-[56ch] text-dark-muted">{lede}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink href="/contact" size="lg">Request a site audit <IconArrowRight /></ButtonLink>
              <Link href="/solutions" className="inline-flex items-center gap-1.5 text-14 text-dark-ink underline decoration-brand-300/60 underline-offset-[6px] transition-colors duration-(--duration-base) hover:text-dark-ink hover:decoration-brand-300">
                Explore the solutions
              </Link>
            </div>
          </div>
          <div className="sentinel-frame relative rounded-2xl border border-brand-300/40 bg-dark-2 p-2">
            {hasSlider ? (
              <SliderFor slider={heroSlider!} aspect="aspect-[16/10]" sizes="(min-width: 1024px) 45vw, 100vw" priority className="rounded-xl" />
            ) : (
              <div className="overflow-hidden rounded-xl"><NocPanel /></div>
            )}
          </div>
        </div>

        {/* The two audiences. */}
        <ul className="mt-14 grid gap-4 md:grid-cols-2">
          {audiences.map((a) => (
            <li key={a.href}>
              <Link href={a.href} className="sentinel-frame group flex h-full flex-col rounded-2xl border border-brand-300/35 bg-dark-2 p-7 transition-colors duration-(--duration-base) hover:border-brand-300/80 lg:p-9">
                <span className="font-display text-24 font-light text-dark-ink lg:text-[28px]">{a.title}</span>
                <span className="mt-2 max-w-[44ch] text-14-5 leading-relaxed text-dark-muted">{a.body}</span>
                <span className="mt-6 inline-flex items-center gap-1.5 text-13-5 font-semibold text-brand-300">
                  {a.cta} <IconArrowRight className="size-3.5 transition-transform duration-(--duration-base) group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* The figures, huge and thin. */}
        <dl className={cn("stat-figures mt-14 grid gap-x-8 gap-y-10 border-t border-dark-line pt-10", stripColumns(stats.length, 2))} {...statFigures(look, true)}>
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dd className="font-display text-[clamp(44px,6vw,84px)] font-extralight leading-none tracking-[-.03em] text-(--stat-ink)"><StatValue value={s.value} /></dd>
              <dt className="mt-3 text-14 text-dark-muted">{s.label}</dt>
            </div>
          ))}
        </dl>
      </Container>
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-brand-300 to-transparent" />
    </section>
  );

  const catalogue = (
    <section className="section-y-lg">
      <Container>
        <div className="text-center [&>div]:mx-auto">
          <SectionHeader kicker="Products" title="The hardware we install, by category" lede="Every line we carry is equipment our engineers deploy and support in the field." />
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.data.slice(0, 6).map((c) => (
            <li key={c.slug}>
              <Link href={`/products/${c.slug}`} data-card className="sentinel-frame group flex h-full flex-col rounded-2xl border border-line-strong bg-card p-7 transition-colors duration-(--duration-base) hover:border-brand-400">
                {/* The icon and the name on one line — never stacked — and the
                    name beside the icon or at the card's far edge, the theme's
                    own option. No product count: the client's rule (2026-09-19). */}
                <span className={cn("flex items-center gap-4", options.heading_align === "right" ? "justify-between" : "")}>
                  <IconTile name={c.icon} fallback="switch" size="lg" />
                  <span className={cn("min-w-0 font-display text-22 font-light leading-tight text-ink", options.heading_align === "right" && "text-right")}>{c.name}</span>
                </span>
                {c.description && <span className="mt-4 text-14 leading-relaxed text-muted">{c.description}</span>}
                <span className="mt-auto flex items-center pt-6 text-13-5">
                  <span className="font-semibold text-brand-ink">See the range</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );

  const quote = (
    <section className="section-y border-y border-line bg-surface">
      <Container className="max-w-[900px] text-center">
        <p className="font-display text-[clamp(22px,2.8vw,34px)] font-light leading-snug text-ink">“{testimonial.quote}”</p>
        <p className="mt-6 text-13-5 text-muted"><b className="font-semibold text-ink">{testimonial.name}</b> · {testimonial.role}</p>
      </Container>
    </section>
  );

  const SECTIONS = [
    { id: "hero", node: hero },
    { id: "partners", node: <Partners items={brands.data} mode="pulse" /> },
    { id: "categories", node: catalogue },
    { id: "credentials", node: <>{quote}<Credentials items={certifications.data} /></> },
    { id: "why", node: <WhyUs settings={settings} /> },
    { id: "solutions", node: <Solutions items={solutions.data.slice(0, 6)} /> },
    { id: "clients", node: <TrustedBy items={clients.data} mode="ring" /> },
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
