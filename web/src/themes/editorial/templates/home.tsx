import Image from "next/image";
import Link from "next/link";
import { Credentials, Partners, TrustedBy } from "@/components/home/sections";
import { Backdrop } from "@/components/ui/backdrop";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { SliderFor } from "@/components/ui/slider-for";
import { IconArrowRight, IdentityIcon, iconMap } from "@/components/icons";
import { statFigures } from "@/components/ui/stat";
import { statLookFor } from "@/lib/stat-look";
import { heroStats } from "@/content/site";
import { formatDate } from "@/lib/dates";
import { motionFor } from "@/lib/motion-choices";
import { bannerFor, heroCopy, statPairs } from "@/lib/site-settings";
import { stripColumns } from "@/lib/strip-columns";
import { cn } from "@/lib/utils";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";

/**
 * Editorial's front page.
 *
 * A paper's front, not a landing page: one lead, a ruled "in numbers" strip,
 * then columns of text under section labels — numbered solutions, the
 * industries, the latest posts with their dates — a dense index of the
 * hardware, the case studies as a ruled list with their results, and the
 * closing notice. Rules, not cards; type, not tiles. The partner marquee,
 * the client wall and the credentials are classic's sections, reused: a
 * logo strip is a logo strip in any paper.
 *
 * **The lead is full-bleed, and it is one of two things.** With a slider
 * configured it is the slider, edge to edge, and the headline sits *under*
 * it as a standfirst — the slides carry their own captions and putting a
 * second headline over them would be two voices. Without one it is a fixed
 * picture with the words on it: the site's default banner (Settings → Page
 * banners), forced dark the way `PageHero` forces its banners dark, so the
 * white type is arithmetic rather than hope; and with no banner uploaded
 * either, a dark band with the theme's backdrop. Asked for on 2026-09-16:
 * "hero may be full width slider or may be fixed image and text on that".
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const look = statLookFor(settings);
  const { kicker, heading, lede } = heroCopy(settings);
  const banner = bannerFor(settings, "company");
  const hasSlider = Boolean(heroSlider && heroSlider.slides?.length);

  const bg = { sections: options.sections, seeds: homeSeeds(settings) };
  const SECTIONS = [
    { id: "hero", node: (
      <>
        {/* The lead. */}
        {hasSlider ? (
          <section className="border-b border-line-strong">
            <SliderFor
              slider={heroSlider!}
              aspect="aspect-[16/9] lg:aspect-[21/9]"
              sizes="100vw"
              priority
              className="rounded-none"
            />
            <Container className="py-8 lg:py-10">
              <Words onDark={false} kicker={kicker} heading={heading} lede={lede} />
            </Container>
          </section>
        ) : (
          <section className="relative grid min-h-[520px] items-end overflow-hidden border-b border-line-strong bg-dark text-dark-ink lg:min-h-[600px]">
            {banner ? (
              <>
                <Image src={banner} alt="" aria-hidden fill sizes="100vw" priority className="object-cover brightness-[.35]" />
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-t from-dark/85 via-dark/40 to-transparent" />
              </>
            ) : (
              <Backdrop variant={motionFor(settings).hero} tone="dark" size={56} />
            )}
            <Container className="relative py-12 lg:py-16">
              <Words onDark kicker={kicker} heading={heading} lede={lede} />
            </Container>
          </section>
        )}

        {/* In numbers. */}
        <section className="border-b border-line-strong">
          <Container>
            {/* The figure at 1.5× the chosen size — 39px at the default, near the 36/44 the front page was drawn at — in the chosen colour. */}
            <dl className={cn("stat-figures grid divide-line-strong sm:divide-x", stripColumns(stats.length, 2))} {...statFigures(look)}>
              {stats.map((s, i) => (
                <div key={s.label} className={cn("py-6 sm:px-6", i === 0 && "sm:pl-0")}>
                  <dt className="flex items-center gap-2 text-11-5 uppercase tracking-[.14em] text-muted">
                    {s.icon && s.icon in iconMap && <IdentityIcon name={s.icon} className="size-4" />}
                    {s.label}
                  </dt>
                  <dd className="mt-1 font-display text-[calc(var(--stat-size)*1.5)] leading-none tracking-[-.02em] text-(--stat-ink)">{s.value}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>
      </>
    ) },
    { id: "partners", node: <Partners items={brands.data} /> },
    { id: "solutions", node: (
      <>
        {/* Three columns of text. */}
        <section className="section-y border-t border-line-strong">
          <Container>
            <div className="grid gap-10 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-line-strong [&>*]:min-w-0">
              <Column label="Solutions" href="/solutions" first>
                <ol className="divide-y divide-line">
                  {solutions.data.slice(0, 6).map((s, i) => (
                    <li key={s.slug} className="py-4">
                      <Link href={`/solutions/${s.slug}`} className="group grid grid-cols-[2.25rem_1fr] gap-2">
                        <span className="font-display text-[22px] leading-none text-faint">{String(i + 1).padStart(2, "0")}</span>
                        <span>
                          <span className="font-display text-[19px] leading-tight text-ink group-hover:underline">{s.title}</span>
                          {s.summary && <span className="mt-1 block text-13-5 leading-snug text-muted">{s.summary}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </Column>
              <Column label="Industries" href="/industries">
                <ul className="divide-y divide-line">
                  {industries.data.slice(0, 6).map((it) => (
                    <li key={it.slug} className="py-4">
                      <Link href={`/industries/${it.slug}`} className="group block">
                        <span className="font-display text-[19px] leading-tight text-ink group-hover:underline">{it.name}</span>
                        {it.summary && <span className="mt-1 block text-13-5 leading-snug text-muted">{it.summary}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Column>
              <Column label="Latest" href="/blog">
                <ul className="divide-y divide-line">
                  {posts.data.slice(0, 4).map((p) => (
                    <li key={p.slug} className="py-4">
                      <Link href={`/blog/${p.slug}`} className="group block">
                        <span className="block font-mono text-11 uppercase tracking-[.08em] text-muted">
                          {formatDate(p.published_at, "short")}{p.reading_minutes ? ` · ${p.reading_minutes} min` : ""}
                        </span>
                        <span className="mt-1 block font-display text-[19px] leading-tight text-ink group-hover:underline">{p.title}</span>
                        {p.excerpt && <span className="mt-1 block text-13-5 leading-snug text-muted">{p.excerpt}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Column>
            </div>
          </Container>
        </section>
      </>
    ) },
    { id: "categories", node: (
      <>
        {/* The hardware, as an index. */}
        <section className="section-y border-t border-line-strong bg-surface">
          <Container>
            <SectionRule label="Hardware" href="/products" cta="The whole catalogue" />
            <ul className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {categories.data.slice(0, 12).map((c) => (
                <li key={c.slug} className="border-b border-line py-2.5">
                  <Link href={`/products/${c.slug}`} className="group flex items-baseline justify-between gap-3">
                    <span className="text-15 font-semibold text-ink group-hover:underline">{c.name}</span>
                    {typeof c.product_count === "number" && (
                      <span className="font-mono text-11 text-muted">{c.product_count}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      </>
    ) },
    { id: "clients", node: <TrustedBy items={clients.data} /> },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    { id: "cases", node: (
      <>
        {/* Case studies as a ruled list. */}
        {caseStudies.data.length > 0 && (
          <section className="section-y border-t border-line-strong">
            <Container>
              <SectionRule label="Case studies" href="/case-studies" cta="All case studies" />
              <ul className="mt-6 divide-y divide-line-strong border-y border-line-strong">
                {caseStudies.data.slice(0, 4).map((cs) => (
                  <li key={cs.slug} className="py-6">
                    <Link href={`/case-studies/${cs.slug}`} className="group grid gap-4 lg:grid-cols-[1fr_2fr_1fr]">
                      <span className="text-12 uppercase tracking-[.12em] text-muted">
                        {cs.client_name ?? "Client"}{cs.industry ? ` · ${cs.industry.name}` : ""}
                      </span>
                      <span>
                        <span className="font-display text-[22px] leading-tight text-ink group-hover:underline">{cs.title}</span>
                        {cs.summary && <span className="mt-1.5 block text-14 leading-snug text-muted">{cs.summary}</span>}
                      </span>
                      {cs.results && cs.results.length > 0 && (
                        <span className="flex flex-wrap gap-x-6 gap-y-2 lg:justify-end">
                          {cs.results.slice(0, 2).map((r) => (
                            <span key={r.label} className="block">
                              <b className="block font-display text-[24px] leading-none text-ink">{r.value}</b>
                              <span className="text-11-5 uppercase tracking-[.1em] text-muted">{r.label}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Container>
          </section>
        )}
      </>
    ) },
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

/** The lead's words — on the page under a slider, or on the picture. */
function Words({ onDark, kicker, heading, lede }: { onDark: boolean; kicker: string; heading: string; lede: string }) {
  return (
  <div className={cn(onDark ? "text-white" : "text-ink")}>
    <span className={cn("flex items-center gap-3 text-11-5 font-semibold uppercase tracking-[.16em]", onDark ? "text-brand-200" : "text-brand-ink")}>
      <span aria-hidden className="h-px w-8 bg-current" />
      {kicker}
    </span>
    <h1 className="display-1 mt-4 max-w-[18ch] font-normal tracking-[-.01em] text-balance">{heading}</h1>
    <p className={cn("mt-5 text-[18px] leading-[1.55]", onDark ? "text-dark-ink" : "text-ink-2")}>{lede}</p>
    <div className="mt-7 flex flex-wrap gap-3">
      <ButtonLink href="/contact" variant={onDark ? "onDark" : "primary"}>
        Talk to an engineer <IconArrowRight />
      </ButtonLink>
      <ButtonLink href="/solutions" variant={onDark ? "onDarkOutline" : "secondary"} className={onDark ? "border-white/30 text-white" : undefined}>
        Explore solutions
      </ButtonLink>
    </div>
  </div>
  );
}

function Column({ label, href, first = false, children }: { label: string; href: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("lg:px-8", first && "lg:pl-0")}>
      <SectionRule label={label} href={href} cta="All" />
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** A section's label on a rule, with its "see all" at the right. */
function SectionRule({ label, href, cta }: { label: string; href: string; cta: string }) {
  return (
    <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
      <h2 className="text-12 font-semibold uppercase tracking-[.16em] text-ink">{label}</h2>
      <Link href={href} className="text-12 font-semibold text-brand-ink hover:underline">{cta} →</Link>
    </div>
  );
}
