import Image from "next/image";
import {
  cn } from "@/lib/utils";
import { stripColumns } from "@/lib/strip-columns";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { ArrowLink,
  ButtonLink } from "@/components/ui/button";
import { Card,
  CardHead,
  SectionHeader } from "@/components/ui/card";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import {
  IconArrowRight,
  IconBook,
  IconCert,
  IconCheck,
  IconTicket,
} from "@/components/icons";
// The process diagram, the AMC inclusion list and the web-services grid are
// genuinely static page furniture, not records anyone edits. The partner
// strip used to be here too — a hand-typed name list — until it needed real
// logos; it now arrives as a prop like every other record-backed section.
// Everything that IS a record — solutions, categories, industries, case
// studies, posts, brands — arrives as props from the CMS, because editing one
// in the admin previously changed every page except this one.
import { amcInclusions, processSteps, supportStats, testimonial, webServices } from "@/content/site";
import { telHref } from "@/lib/site-settings";
import type { Brand, BlogPost, CaseStudy, Industry, ProductCategory, Solution } from "@/types/api";

/* ---------------------------------------------------------------- partners */

/**
 * A continuous, seamless scroll of the manufacturers the catalogue actually
 * carries — real logos now, not the hand-typed name list this replaced.
 *
 * `items` is `publicApi.brands()`, the same endpoint the product filter
 * reads: a brand shown here always has a real logo and at least one
 * published product behind it, and the strip changes on its own as the
 * catalogue does. Nothing to show is nothing to render — a fresh install with
 * no brand tied to a published product would otherwise print the caption over
 * an empty row, which reads as broken rather than as "nothing yet".
 *
 * The track renders the list **twice**, back to back, and slides exactly one
 * copy's width to the left before looping — because the two copies are
 * identical, the loop point is invisible. See `.brand-marquee-track` in
 * globals.css for why that is a hand-written `transform` keyframe rather than
 * a Tailwind `translate-x-*` utility, and why reduced motion needs no extra
 * guard here.
 *
 * The visual track is `aria-hidden`: a screen reader gets the brand names
 * once, from the plain `sr-only` list beside it, rather than twice from a
 * duplicated one it has no way to know is decorative.
 *
 * **Dark scheme turns every logo to solid white rather than pinning the band
 * to a literal light colour.** The first cut did the latter — a trademarked
 * logo's colours are fixed and do not invert with a theme, and HPE Aruba's own
 * artwork has no fill at all on its "HPE" glyph, so it rendered in whatever
 * `color` inherited, i.e. black-on-near-black in dark. Forcing the whole band
 * to always be white fixed that one brand and cost every other one its actual
 * colour on a page that was otherwise dark, and a black-on-white strip sitting
 * in a dark-mode page reads as a mistake, not a design.
 *
 * `brightness(0) invert(1)` in dark scheme instead: it collapses every colour
 * in an image to black and then flips that to white, which is the standard way
 * to make an arbitrary raster or vector-as-image logo a flat white silhouette
 * without touching its file. It answers HPE Aruba's missing fill the same way
 * it answers everything else — there is no colour left to be missing — and it
 * lets the section go back to the page's own background token, dark in dark
 * mode, matching every other strip on the site rather than standing out as a
 * pinned-light exception.
 */
export function Partners({ items }: { items: Brand[] }) {
  if (items.length === 0) return null;

  return (
    <div data-aos="fade-up" className="border-b border-line pt-5 pb-9.5">
      <Container>
        <p className="mb-6.5 text-center text-xs font-semibold uppercase tracking-[.13em] text-muted">
          Certified partner &amp; deployment experience across
        </p>

        <ul className="sr-only">
          {items.map((brand) => <li key={brand.id}>{brand.name}</li>)}
        </ul>

        <div className="brand-marquee brand-marquee-fade overflow-hidden">
          {/*
            `mr-10` on every item, not `gap-10` on this `<ul>`.

            Flex `gap` inserts a gap **between** children — N items produce
            N−1 gaps, never N. With sixteen items (eight brands, doubled) that
            is fifteen gaps, an odd number, so exactly half of them falls on
            each side of the halfway point and the other half-gap is simply
            missing. `translateX(-50%)` is then 20px short of the true
            distance from one copy's first logo to the next copy's first logo
            — measured directly in the DOM, not assumed — so every loop the
            track snapped forward by that missing 20px in a single frame.

            Giving every item its own trailing margin instead — including the
            last one of each copy — makes each copy a self-contained,
            independently measurable width with no shared, order-dependent
            gap at the seam. Two identical copies then sum to *exactly*
            double, and `-50%` lands exactly on the seam. Verified by
            sampling the track's on-screen position every frame across a full
            36s loop: no jump above ordinary per-frame jitter anywhere in it.
          */}
          <ul aria-hidden="true" className="brand-marquee-track flex w-max items-center">
            {[...items, ...items].map((brand, i) => (
              <li key={`${brand.id}-${i}`} className="relative mr-10 flex h-10 w-28 shrink-0 items-center justify-center">
                {brand.logo ? (
                  /*
                    `fill`, not `width`/`height`.

                    Twenty-six brands, twenty-six native aspect ratios, and no
                    per-brand dimensions on the wire to give an accurate
                    `width`/`height` — unlike the site's own logo, which the
                    API sends real numbers for. A guessed pair (140×40, tried
                    first) declares an aspect ratio the actual SVG almost never
                    matches, and whichever axis `object-contain` then leaves
                    free to size itself, Next's dev console logs as "width or
                    height modified, but not the other" on every load — which
                    `npm run audit` counts as a failure, not a warning to
                    ignore.

                    `fill` sidesteps the mismatch instead of trying to win it:
                    it declares no aspect ratio of its own, so there is nothing
                    for the rendered size to disagree with. It needs a sized,
                    `position: relative` parent to fill, which is exactly what
                    the slot `<li>` already is.
                  */
                  <Image
                    src={brand.logo}
                    alt=""
                    fill
                    unoptimized
                    className="brand-logo object-contain"
                  />
                ) : (
                  <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-faint">
                    {brand.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </div>
  );
}

/* --------------------------------------------------------------- solutions */

export function Solutions({ items }: { items: Solution[] }) {
  return (
    <section data-aos="fade-up" id="solutions" className="section-y-lg">
      <Container>
        <SectionHeader
          kicker="Solutions"
          title="Infrastructure built once, supported for years."
          lede="Nine practice areas, one accountable partner — from the switch fabric to the firewall policy to the AMC contract behind it."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => {
            return (
              <Card key={s.slug} tint={hueForIcon(s.icon)}>
                <CardHead iconName={s.icon}>{s.title}</CardHead>
                <p className="text-[14.5px] leading-[1.58] text-muted">{s.summary}</p>
                <ArrowLink href={`/solutions/${s.slug}`} className="mt-4">
                  Explore {s.title.toLowerCase()}
                </ArrowLink>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------- products */

export function ProductCategories({ items }: { items: ProductCategory[] }) {
  return (
    <section data-aos="fade-up" id="products" className="border-y border-line bg-surface section-y-lg">
      <Container>
        <SectionHeader
          kicker="Products"
          title="A catalogue backed by people who install it."
          lede="Every line we carry is hardware our engineers deploy and support in the field. Browse the catalogue, then ask us what actually fits."
        />
        <div className="grid gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {items.map((c) => {
            return (
              <Link
                key={c.slug}
                href={`/products/${c.slug}`}
                className="group block overflow-hidden rounded-lg border border-line-strong bg-card transition-all duration-200 ease-brand hover:border-brand-300 hover:shadow-2 hover:-translate-y-0.5"
              >
                {/*
                  A fixed 4:3 well, so a slow image cannot shuffle the grid —
                  the same rule every other cover on this site follows, and a
                  ratio rather than a fixed height so the well stays 4:3 at
                  every column count instead of stretching wider at xl. A
                  category with no image yet falls back to its own tinted
                  icon panel rather than leaving a hole in the row.
                */}
                <span className="block aspect-[4/3] overflow-hidden bg-surface-2">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.image}
                      alt={c.image_alt ?? ""}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 ease-brand motion-safe:group-hover:scale-[1.04]"
                    />
                  ) : (
                    <span
                      className="grid size-full place-items-center"
                      style={{ background: `color-mix(in srgb, ${hueForIcon(c.icon, "switch")} 12%, var(--color-card))` }}
                    >
                      <IconTile name={c.icon} fallback="switch" size="lg" />
                    </span>
                  )}
                </span>

                <span className="flex items-center gap-3 px-4 py-3.5">
                  <IconTile name={c.icon} fallback="switch" />
                  <span className="min-w-0">
                    <b className="block truncate text-[14.5px] font-semibold leading-tight text-ink">{c.name}</b>
                    {c.description && <span className="block truncate text-[12.5px] text-muted">{c.description}</span>}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
        <div className="mt-6.5">
          <ButtonLink href="/products" variant="secondary">
            Browse full catalogue <IconArrowRight />
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ why us */

export function WhyUs() {
  return (
    <section data-aos="fade-up" className="relative overflow-hidden section-y-lg">
      {/*
        Decorative only — aria-hidden and behind everything. `Container`
        below carries `relative` so it paints after this absolute layer in
        the same positioned stacking bucket; without that it would be a
        static sibling, and CSS paints positioned elements after static
        ones regardless of source order, putting the pattern on top of the
        copy instead of behind it.
      */}
      <div
        aria-hidden
        className="pattern-fade pointer-events-none absolute inset-0 opacity-40 [background-image:url(/patterns/waves-blue.svg)] [background-size:1400px_auto] [background-position:center] [background-repeat:no-repeat]"
      />
      <Container className="relative">
        <div className="grid items-start gap-11 lg:grid-cols-[1.25fr_.75fr] lg:gap-14">
          <div>
            <SectionHeader
              className="mb-7.5"
              kicker="Why Technoware"
              title="Most IT problems are handover problems."
              lede="Someone sells the box, someone else racks it, nobody owns the outcome. We keep all four stages under one roof so there is nobody to point at but us."
            />
            <ol className="grid gap-px overflow-hidden rounded-lg border border-line-strong bg-line">
              {processSteps.map((s) => (
                <li key={s.n} className="grid grid-cols-[auto_1fr] items-start gap-4.5 bg-card p-6 transition-colors hover:bg-brand-50">
                  <span className="grid size-7.5 place-items-center rounded-full border border-brand-200 bg-brand-50 font-mono text-xs font-medium text-brand-ink">
                    {s.n}
                  </span>
                  <div>
                    <h3 className="mb-1.5 text-[16.5px]">{s.title}</h3>
                    <p className="text-[14.5px] leading-[1.58] text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid content-start gap-4">
            <figure className="rounded-xl bg-dark p-8 text-dark-ink">
              {/* 600, not 500. This pull-quote was the only element on the whole
                  site rendering Instrument Sans 500, and that weight is a 17KB
                  font file requested on every page. */}
              <blockquote className="font-display text-xl font-semibold leading-[1.42] tracking-[-.02em]">
                “{testimonial.quote}”
              </blockquote>
              <figcaption className="mt-5.5 flex items-center gap-3 border-t border-dark-line pt-5">
                <span className="grid size-9.5 shrink-0 place-items-center rounded-full border border-brand-500 bg-brand-700 font-display text-sm font-semibold text-white">
                  {testimonial.initials}
                </span>
                <span>
                  <b className="block text-sm">{testimonial.name}</b>
                  <span className="text-[13px] text-dark-muted">{testimonial.role}</span>
                </span>
              </figcaption>
            </figure>

            <div className="rounded-xl border border-line-strong bg-surface p-6.5">
              <h3 className="mb-4 text-[15.5px]">Every AMC contract includes</h3>
              <ul className="mb-4.5 grid gap-2.75">
                {amcInclusions.map((i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-normal text-muted">
                    <IconCheck className="mt-[3px] size-[15px] shrink-0 text-brand-ink" />
                    {i}
                  </li>
                ))}
              </ul>
              <ArrowLink href="/solutions/amc">See what AMC covers</ArrowLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------- industries */

export function Industries({ items }: { items: Industry[] }) {
  return (
    <section data-aos="fade-up" id="industries" className="border-y border-line bg-surface section-y-lg">
      <Container>
        <SectionHeader
          kicker="Industries"
          title="Different floors, different failure modes."
          lede="A hospital network and a factory network fail in completely different ways. We build for the one you actually run."
        />
        <div className="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => {
            const tint = hueForIcon(i.icon, "building");
            return (
              <Link
                key={i.slug}
                href={`/industries/${i.slug}`}
                className="flex flex-col rounded-lg border border-line-strong px-5 py-5 transition-all duration-200 ease-brand hover:border-brand-300 hover:shadow-2 hover:-translate-y-0.5"
                style={{
                  // Same wash as `Card`'s own `tint` (Solutions uses it
                  // directly) — reproduced by hand rather than reused because
                  // this card is itself the `<Link>`, and `Card` renders a
                  // plain `<div>`.
                  background: `linear-gradient(155deg, color-mix(in srgb, ${tint} 10%, var(--color-card)) 0%, var(--color-card) 60%)`,
                }}
              >
                <span className="flex items-center gap-2.5">
                  <IconTile name={i.icon} fallback="building" />
                  <b className="font-display text-[15.5px] tracking-[-.02em]">{i.name}</b>
                </span>
                <span className="mt-1.5 text-[13px] text-muted">{i.summary}</span>
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------ web services */

export function WebServices() {
  return (
    <section data-aos="fade-up" id="services" className="relative overflow-hidden section-y-lg">
      {/* Decorative only — see the note on `.pattern-fade` in globals.css. */}
      <div
        aria-hidden
        className="pattern-fade pointer-events-none absolute inset-0 opacity-40 [background-image:url(/patterns/network-mesh.svg)] [background-size:1400px_auto] [background-position:center] [background-repeat:no-repeat]"
      />
      <Container className="relative">
        <SectionHeader
          kicker="Web Services"
          title="The other half of your infrastructure."
          lede="Domains, hosting and business email managed by the same team that runs your office network — one vendor, one number to call."
        />
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {webServices.map((s) => {
            const tint = hueForIcon(s.icon, "globe");
            return (
              <Link
                key={s.slug}
                href={`/services/${s.slug}`}
                className="rounded-lg border border-line-strong p-5.5 transition-all duration-200 ease-brand hover:border-brand-300 hover:shadow-1 hover:-translate-y-0.5"
                style={{
                  // Same wash as `Card`'s own `tint` — see the note there.
                  background: `linear-gradient(155deg, color-mix(in srgb, ${tint} 10%, var(--color-card)) 0%, var(--color-card) 60%)`,
                }}
              >
                <div className="mb-3 flex items-center gap-2.75">
                  <IconTile name={s.icon} fallback="globe" />
                  <h3 className="text-base">{s.title}</h3>
                </div>
                <p className="text-sm leading-[1.55] text-muted">{s.body}</p>
                <div className="mt-3.5 font-mono text-xs text-muted">{s.note}</div>
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/* ----------------------------------------------------------------- support */

const sampleTickets = [
  { id: "#4821", subject: "AP-04 dropping clients in warehouse", label: "In progress", warn: true },
  { id: "#4818", subject: "New user setup — accounts team", label: "Assigned", warn: false },
  { id: "#4802", subject: "Quarterly firewall policy review", label: "Scheduled", warn: false },
  { id: "#4794", subject: "NAS capacity nearing threshold", label: "Pending you", warn: true },
];

export function SupportBand() {
  return (
    <section data-aos="fade-up" id="support" className="section-y-lg relative overflow-hidden bg-dark text-dark-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[30%] -right-[8%] size-130 rounded-full bg-[radial-gradient(closest-side,rgba(143,166,94,.22),transparent)]"
      />
      <Container className="relative">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14 [&>*]:min-w-0">
          <div>
            <span className="text-[11.5px] font-semibold uppercase tracking-[.13em] text-brand-300">Support</span>
            <h2 className="display-2 mt-3.5">A support desk, not a call queue.</h2>
            <p className="lede mt-4 text-dark-muted">
              Every contract customer gets a portal login, full ticket history and a named
              engineer. Raise a ticket, watch it move, see who has it — no chasing, no
              re-explaining the problem to a third person.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/portal/tickets/new" variant="onDark">
                <IconTicket /> Submit a ticket
              </ButtonLink>
              <ButtonLink href="/knowledge-base" variant="onDarkOutline">
                <IconBook /> Knowledge base
              </ButtonLink>
            </div>
            <dl className={cn("mt-7 grid gap-px overflow-hidden rounded-lg border border-dark-line bg-dark-line", stripColumns(supportStats.length, 2))}>
              {supportStats.map((s) => (
                <div key={s.label} className="bg-dark p-5">
                  <dd className="block font-display text-[26px] font-bold tracking-[-.03em]">{s.value}</dd>
                  <dt className="text-[12.5px] text-[#a8ada1]">{s.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div aria-hidden className="overflow-hidden rounded-xl border border-dark-line bg-dark-2">
            <div className="flex items-center gap-2.5 border-b border-dark-line px-4.5 py-3.5 text-[13px] font-semibold">
              <IconTicket className="size-[15px] text-brand-300" />
              My tickets
              <span className="ml-auto font-mono text-[11.5px] font-normal text-dark-muted">4 open</span>
            </div>
            {sampleTickets.map((t) => (
              <div key={t.id} className="flex items-center gap-3.5 border-b border-dark-line px-4.5 py-3.5 last:border-b-0">
                <span className="w-[62px] shrink-0 font-mono text-[11.5px] text-dark-muted">{t.id}</span>
                <span className="min-w-0 truncate text-[13.5px] text-dark-ink">{t.subject}</span>
                <span className={
                  "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.05em] " +
                  (t.warn ? "bg-[#c9993c]/15 text-[#dcb066]" : "bg-brand-400/15 text-brand-300")
                }>
                  {t.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------ case studies */

export function CaseStudies({ items }: { items: CaseStudy[] }) {
  return (
    <section data-aos="fade-up" className="section-y-lg">
      <Container>
        <SectionHeader
          kicker="Case studies"
          title="Projects, with the numbers attached."
          lede="Selected deployments where the brief was clear, the constraints were real and the outcome is measurable."
        />
        <div className="grid items-stretch gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {items.map((c) => {
            return (
              <Link
                key={c.slug}
                href={`/case-studies/${c.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-line-strong bg-card transition-all duration-200 ease-brand hover:border-brand-300 hover:shadow-2 hover:-translate-y-0.5"
              >
                {/* Same 4:3 well as the product category tiles, so a slow
                    image cannot shuffle the grid and the two grids read as
                    one family. */}
                <span className="grid aspect-[4/3] place-items-center overflow-hidden bg-linear-135 from-brand-800 to-brand-600">
                  {c.cover_image
                    ? <Image src={c.cover_image} alt={c.cover_image_alt ?? ""} width={420} height={315}
                        className="size-full object-cover transition-transform duration-300 ease-brand motion-safe:group-hover:scale-[1.04]" unoptimized />
                    : <IconCert className="size-11 text-white/35" />}
                </span>
                <span className="flex flex-1 flex-col px-4 py-3.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-brand-ink">
                    {c.industry?.name ?? c.client_name ?? "Case study"}
                  </span>
                  <b className="mt-1 mb-1 truncate text-[14.5px] font-semibold leading-tight text-ink">{c.title}</b>
                  <span className="truncate text-[12.5px] text-muted">{c.summary}</span>
                  <dl className="mt-3 flex gap-5 border-t border-line pt-3">
                    {(c.results ?? []).slice(0, 2).map((r) => (
                      <div key={r.label}>
                        <dd className="block font-display text-base font-semibold tracking-[-.02em]">{r.value}</dd>
                        <dt className="text-[11px] text-muted">{r.label}</dt>
                      </div>
                    ))}
                  </dl>
                </span>
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/* --------------------------------------------------------------- resources */

export function Resources({ items }: { items: BlogPost[] }) {
  return (
    <section data-aos="fade-up" id="resources" className="relative overflow-hidden border-y border-line bg-surface section-y-lg">
      {/* Decorative only — see the note on `.pattern-fade` in globals.css. */}
      <div
        aria-hidden
        className="pattern-fade pointer-events-none absolute inset-0 opacity-50 [background-image:url(/patterns/circle-fade.svg)] [background-size:700px_700px] [background-position:center] [background-repeat:no-repeat]"
      />
      <Container className="relative">
        <SectionHeader
          kicker="Resources"
          title="Written by the engineers on the job."
          lede="Field notes, configuration guides and knowledge-base articles — the same material our support desk uses."
        />
        <div className="grid gap-3.5 lg:grid-cols-2">
          {items.map((p) => {
            const published = p.published_at ? new Date(p.published_at) : null;
            return (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="flex gap-4.5 rounded-lg border border-line-strong bg-card p-5 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
              >
                <div className="grid shrink-0 place-content-center rounded-lg bg-brand-50 px-3.5 py-2 text-center font-mono">
                  <b className="block text-[19px] text-brand-ink">{published ? published.getDate() : "—"}</b>
                  <span className="text-[11px] uppercase tracking-[.04em] text-brand-ink">
                    {published ? published.toLocaleString("en-GB", { month: "short" }) : ""}
                  </span>
                </div>
                <div>
                  <h3 className="mb-1.25 text-base">{p.title}</h3>
                  <p className="text-[13.5px] leading-normal text-muted">{p.excerpt}</p>
                  <div className="mt-2.25 text-xs text-muted">
                    {p.reading_minutes ? `${p.reading_minutes} min read` : ""}
                    {p.author?.name ? ` · ${p.author.name}` : ""}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-6.5">
          <ButtonLink href="/resources" variant="secondary">
            All resources <IconArrowRight />
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}

/* --------------------------------------------------------------- final CTA */

export function FinalCta({ phone }: { phone?: string }) {
  return (
    <section data-aos="fade-up" className="pb-19 lg:pb-23">
      <Container>
        <div className="relative overflow-hidden rounded-xl bg-brand-900 px-8 py-11 text-center text-white sm:px-10 sm:py-15">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_60%_80%_at_50%_0%,#000,transparent_70%)]"
          />
          <div className="relative">
            <h2 className="display-2 text-white">Let&rsquo;s look at what you&rsquo;re actually running.</h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[#cdd6bb]">
              A site visit and an honest infrastructure audit — no obligation, no scripted
              sales call. You get the findings in writing whether or not you work with us.
            </p>
            <div className="mt-7.5 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/contact" variant="onDark">
                Book a site audit <IconArrowRight />
              </ButtonLink>
              {/* A tel: link rather than a second route to /contact — on a
                  phone this should dial, which is the point of putting a
                  number on a call to action. */}
              <ButtonLink
                href={phone ? telHref(phone) : "/contact"}
                variant="onDarkOutline"
                className="border-white/25 text-white"
              >
                {phone ? `Call ${phone}` : "Talk to an engineer"}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
