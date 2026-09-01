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
import { IconTile } from "@/components/ui/icon-tile";
import {
  IconArrowRight,
  IconBook,
  IconCert,
  IconCheck,
  IconTicket,
} from "@/components/icons";
// What remains here is genuinely static: the partner logos, the process
// diagram, the AMC inclusion list and the web-services grid are page furniture,
// not records anyone edits. Everything that IS a record — solutions,
// categories, industries, case studies, posts — now arrives as props from the
// CMS, because editing one in the admin previously changed every page except
// this one.
import { amcInclusions, partners, processSteps, supportStats, testimonial, webServices } from "@/content/site";
import { telHref } from "@/lib/site-settings";
import type { BlogPost, CaseStudy, Industry, ProductCategory, Solution } from "@/types/api";

/* ---------------------------------------------------------------- partners */

export function Partners() {
  return (
    <div data-aos="fade-up" className="border-b border-line py-9.5">
      <Container>
        <p className="mb-6.5 text-center text-xs font-semibold uppercase tracking-[.13em] text-muted">
          Certified partner &amp; deployment experience across
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-11 gap-y-3.5">
          {partners.map((p) => (
            <li key={p} className="font-display text-[17px] font-semibold tracking-[-.02em] text-faint transition-colors hover:text-ink-2">
              {p}
            </li>
          ))}
        </ul>
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
              <Card key={s.slug}>
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
        <div className="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => {
            return (
              <Link
                key={c.slug}
                href={`/products/${c.slug}`}
                className="flex items-center gap-3.5 rounded border border-line-strong bg-card px-4 py-4 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
              >
                <IconTile name={c.icon} fallback="switch" />
                <span className="min-w-0">
                  <b className="block text-[14.5px] font-semibold leading-tight text-ink">{c.name}</b>
                  <span className="text-[12.5px] text-muted">{c.description}</span>
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
    <section data-aos="fade-up" className="section-y-lg">
      <Container>
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
            return (
              <Link
                key={i.slug}
                href={`/industries/${i.slug}`}
                className="flex flex-col rounded-lg border border-line-strong bg-card px-5 py-5 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
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
    <section data-aos="fade-up" id="services" className="section-y-lg">
      <Container>
        <SectionHeader
          kicker="Web Services"
          title="The other half of your infrastructure."
          lede="Domains, hosting and business email managed by the same team that runs your office network — one vendor, one number to call."
        />
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {webServices.map((s) => {
            return (
              <Link
                key={s.slug}
                href={`/services/${s.slug}`}
                className="rounded-lg border border-line-strong bg-card p-5.5 transition-all duration-200 hover:border-brand-300 hover:shadow-1"
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
        <div className="grid items-stretch gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => {
            return (
              <Link
                key={c.slug}
                href={`/case-studies/${c.slug}`}
                className="flex h-full flex-col overflow-hidden rounded-lg border border-line-strong bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2"
              >
                <div className="grid h-37.5 place-items-center overflow-hidden bg-linear-135 from-brand-800 to-brand-600">
                  {c.cover_image
                    ? <Image src={c.cover_image} alt={c.cover_image_alt ?? ""} width={420} height={150}
                        className="size-full object-cover" unoptimized />
                    : <IconCert className="size-11 text-white/35" />}
                </div>
                <div className="flex flex-1 flex-col p-5.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-brand-ink">
                    {c.industry?.name ?? c.client_name ?? "Case study"}
                  </span>
                  <h3 className="mt-2.5 mb-2 text-[17px]">{c.title}</h3>
                  <p className="text-sm leading-[1.55] text-muted">{c.summary}</p>
                  <dl className="mt-auto flex gap-5.5 border-t border-line pt-4">
                    {(c.results ?? []).slice(0, 2).map((r) => (
                      <div key={r.label}>
                        <dd className="block font-display text-lg font-semibold tracking-[-.02em]">{r.value}</dd>
                        <dt className="text-xs text-muted">{r.label}</dt>
                      </div>
                    ))}
                  </dl>
                </div>
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
    <section data-aos="fade-up" id="resources" className="border-y border-line bg-surface section-y-lg">
      <Container>
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
                <div className="shrink-0 border-r border-line pr-4.5 text-center font-mono">
                  <b className="block text-[19px] text-ink">{published ? published.getDate() : "—"}</b>
                  <span className="text-[11px] uppercase text-muted">
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
