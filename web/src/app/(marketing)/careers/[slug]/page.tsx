import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { RecordSections, laidOutAsSections } from "@/components/page-sections/record-sections";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Prose } from "@/components/ui/prose";
import { ShareLinks } from "@/components/ui/share-links";
import { Collection, Tile } from "@/components/ui/collection";
import { cardTint } from "@/components/ui/card";
import { IconBank, IconBriefcase, IconCheck, IconGauge } from "@/components/icons";
import { IconMail, IconMapPin } from "@/components/icons-ui";
import { publicApi } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { buildMetadata, JsonLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import { getSiteSettings } from "@/lib/settings";
import { hueFor } from "@/lib/hues";
import type { JobOpening } from "@/types/api";
import { ApplyForm } from "./apply-form";
import { formatDate } from "@/lib/dates";
import { brandName } from "@/lib/brand";

export const revalidate = 120;

async function load(slug: string): Promise<JobOpening | null> {
  try {
    return (await publicApi.career(slug)).data;
  } catch (error) {
    // A closed or unpublished role 404s at the API, which is the same answer
    // this page gives. See `JobOpening::isOpen()`.
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/*
 * Empty on purpose, and the export itself is the feature.
 *
 * In Next 16 a dynamic-segment route is entered into the ISR route cache only
 * when it exports `generateStaticParams` — without it the page is rendered on
 * every request, whatever the fetches inside it are cached as, and never
 * sends an `x-nextjs-cache` header. Every `[slug]` route in this site was in
 * that state, measured at 1.5–4.5s TTFB against a local API. Returning `[]`
 * enumerates nothing at build (the build already needs the API reachable;
 * rendering every record would slow it for no visitor) and lets each path
 * render on its first request and be served from the cache until its tags
 * are invalidated or the shortest `revalidate` among its fetches expires.
 *
 * **What it costs**: a request-time API — `cookies()`, `headers()`,
 * `searchParams` — or a `cache: "no-store"` fetch anywhere in this render is
 * no longer a silent fallback to dynamic rendering; it is a 500 ("Page changed
 * from static to dynamic at runtime"). Everything this page reads is ISR-tagged
 * through `publicApi`, and the only thing on it that touches a cookie is a
 * Server Action, which runs on submit rather than on render. Keep it that way.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await load(slug);

  if (!job) return buildMetadata({ title: "Role not found", path: `/careers/${slug}` });

  return buildMetadata({
    title: job.title,
    description: job.summary ?? undefined,
    path: `/careers/${job.slug}`,
    seo: job.seo,
  });
}

const longDate = (iso: string) =>
  formatDate(iso, "long");

/**
 * Where the role is, in words.
 *
 * A blank `location` means remote — said in the admin field's own hint, so it
 * is a choice rather than an omission. It has to mean *something*: Google
 * requires a `JobPosting` to carry either a `jobLocation` or
 * `jobLocationType: TELECOMMUTE`, and a posting with neither is not indexed at
 * all.
 */
export const locationLabel = (job: JobOpening) => job.location?.trim() || "Remote";

/**
 * The role at a glance: the four facts somebody decides on before reading a
 * word of the description, each with its glyph, in one row under the hero.
 * Blanks are left out rather than printed as a dash — a row that says
 * "Salary: —" is a row that says the company would not tell you.
 */
function Glance({ job }: { job: JobOpening }) {
  const items: { icon: ReactNode; label: string; value: string }[] = [
    { icon: <IconMapPin className="size-4" aria-hidden />, label: "Location", value: locationLabel(job) },
    { icon: <IconBriefcase className="size-4" aria-hidden />, label: "Employment", value: job.employment_type_label },
    ...(job.experience ? [{ icon: <IconGauge className="size-4" aria-hidden />, label: "Experience", value: job.experience.range }] : []),
    ...(job.salary ? [{ icon: <IconBank className="size-4" aria-hidden />, label: "Salary", value: job.salary.label }] : []),
  ];

  return (
    <ul className="flex flex-wrap gap-x-8 gap-y-3">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-brand-ink/30 text-brand-ink">{it.icon}</span>
          <span>
            <span className="block text-11-5 font-semibold uppercase tracking-[.08em] text-muted">{it.label}</span>
            <span className="block text-14-5 font-medium text-ink">{it.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Facts({ job, company }: { job: JobOpening; company: string }) {
  const rows: [string, string][] = [
    // The company is named on the page, not only in the structured data. A
    // vacancy is often the first page somebody sees of a firm, and reaching it
    // from a job board means arriving with no idea whose it is.
    ["Company", company],
    ["Employment", job.employment_type_label],
    ["Location", locationLabel(job)],
    ...(job.department ? [["Team", job.department] as [string, string]] : []),
    ...(job.experience ? [["Experience", job.experience.range] as [string, string]] : []),
    ...(job.openings > 1 ? [["Openings", String(job.openings)] as [string, string]] : []),
    // Omitted entirely when blank, rather than printed as a dash.
    ...(job.salary ? [["Salary", job.salary.label] as [string, string]] : []),
    // Posted date: it tells a reader whether a role is fresh or has been
    // sitting there since March, which is the first thing anyone wants to know.
    ...(job.published_at ? [["Posted", longDate(job.published_at)] as [string, string]] : []),
    ...(job.closes_at ? [["Applications close", longDate(job.closes_at)] as [string, string]] : []),
  ];

  return (
    <dl data-card className="rounded-lg border border-line-strong bg-card p-5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 border-b border-line py-2 last:border-b-0">
          <dt className="text-13 text-muted">{label}</dt>
          <dd className="text-right text-13-5 font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One of the two lists — what the role does, what it needs — as a card on a
 * wash of its own hue, so the two read as a pair rather than as one list
 * that happens to be twice as long. Position decides the colour, the
 * support hub's rule; the words stay in the graded inks.
 */
function Bullets({ title, items, hue }: { title: string; items: string[]; hue: string }) {
  if (items.length === 0) return null;

  return (
    <section data-card className="rounded-lg border border-line-strong bg-card p-6" style={cardTint(hue)}>
      <h2 className="mb-4 text-19 font-semibold tracking-[-.01em]">{title}</h2>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-15 leading-[1.6] text-ink-2">
            <IconCheck className="mt-1 size-4 shrink-0 text-brand-ink" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Independent reads, together — the settings and the other roles do not
  // wait for the vacancy, and the list degrades to nothing on its own.
  const [job, settings, others] = await Promise.all([
    load(slug),
    getSiteSettings(),
    publicApi.careers().then((r) => r.data).catch(() => [] as JobOpening[]),
  ]);

  if (!job) notFound();

  const company = settings.company_name ?? brandName();
  const site = siteUrl();
  const url = `${site}/careers/${job.slug}`;
  // Whoever reads applications, from Settings → Contact; the support desk otherwise.
  const contact = settings.careers_email || settings.support_email || null;
  const otherRoles = others.filter((o) => o.slug !== job.slug).slice(0, 3);
  // Builder sections in place of the written description (0.130.0): bands
  // under the at-a-glance strip, and the lists and the facts after them.
  const laidOut = laidOutAsSections(job);
  const crumbs = [{ name: "Careers", path: "/careers" }, { name: job.title, path: `/careers/${job.slug}` }];
  // With the description gone to the sections, the left column may hold
  // nothing — then the facts stand alone, centred, not beside a void.
  const alone = laidOut && job.responsibilities.length === 0 && job.requirements.length === 0
    && (job.qualifications?.length ?? 0) === 0;

  return (
    <>
      <PageHero
        section="company"
        kicker="Careers"
        title={job.title}
        lede={job.summary}
        crumbs={crumbs}
      />

      {/* At a glance, under the hero — the facts a reader decides on first. */}
      <div className="border-b border-line bg-surface">
        <Container className="py-5">
          <Glance job={job} />
        </Container>
      </div>

      {laidOut && <RecordSections sections={job.sections ?? []} crumbs={crumbs} />}

      <Container className="section-y">
        <div className={alone ? "mx-auto max-w-[420px]" : "grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14"}>
          {!alone && (
          <div className={laidOut ? "min-w-0 [&>*:first-child]:mt-0" : "min-w-0"}>
            {/*
              The description, or the summary standing in for one: a vacancy
              whose editor wrote a summary and no body used to open on an
              empty column, and the summary is already in the hero — but a
              column with nothing in it reads as a page that failed to load.
            */}
            {!laidOut && (job.description
              ? <Prose html={job.description} />
              : job.summary && <p className="text-16 leading-[1.7] text-ink-2">{job.summary}</p>)}

            {(job.responsibilities.length > 0 || job.requirements.length > 0) && (
              <div className="mt-10 grid gap-5 xl:grid-cols-2">
                <Bullets title="What you will do" items={job.responsibilities} hue="var(--color-neon-6)" />
                <Bullets title="What we are looking for" items={job.requirements} hue="var(--color-neon-8)" />
              </div>
            )}

            {job.qualifications && job.qualifications.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 text-19 font-semibold tracking-[-.01em]">Qualifications</h2>
                <p className="flex flex-wrap gap-2">
                  {job.qualifications.map((q) => <Badge key={q} tone="brand">{q}</Badge>)}
                </p>
                <p className="mt-2.5 text-13-5 text-muted">
                  Any one of these. If your background is close but not on the list, apply anyway
                  and say why.
                </p>
              </section>
            )}
          </div>
          )}

          {/*
            The aside has a job of its own now: the facts, the button that
            takes a reader to the form, and a way to send the page on. It
            used to hold the facts alone, at the top of an otherwise empty
            column.
          */}
          <aside className="grid content-start gap-4 lg:sticky lg:top-24 lg:self-start">
            <Facts job={job} company={company} />
            <ButtonLink href="#apply" size="lg" className="justify-center">Apply for this role</ButtonLink>
            <ShareLinks url={url} title={job.title} label="Send this to someone" className="justify-center" />
          </aside>
        </div>
      </Container>

      {/*
        The application, as a band across the page rather than a form down
        the left of an empty half: the destination of the page, drawn like
        one. Beside the form, what happens after it is sent — a sequence,
        so numbered — who reads it, and the other open roles, so the band is
        never a form beside a void.
      */}
      <section id="apply" className="scroll-mt-24 border-t border-line bg-surface section-y">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)] lg:gap-16">
            <div className="min-w-0">
              <h2 className="text-22 font-semibold tracking-[-.015em]">Apply for this role</h2>
              <p className="mt-1.5 mb-6 text-14-5 leading-[1.6] text-muted">
                A CV and a couple of lines about why. We read every application.
              </p>
              <ApplyForm slug={job.slug} title={job.title} />
            </div>

            <div className="grid content-start gap-8">
              <section>
                <h3 className="mb-4 text-15-5 font-semibold">What happens next</h3>
                <ol className="grid gap-4">
                  {[
                    ["We read it", "A person, not a filter. Every application gets a reply, whichever way it goes."],
                    ["A call within a week", "Twenty minutes about the role, the site work and what you are looking for."],
                    ["A technical conversation", "With the engineer you would work beside — a real problem from a real site, not a quiz."],
                  ].map(([title, body], i) => (
                    <li key={title} className="grid grid-cols-[auto_1fr] gap-3.5">
                      <span className="grid size-7 place-items-center rounded-full border border-brand-ink/30 font-mono text-xs font-medium text-brand-ink">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <span className="block text-14-5 font-semibold text-ink">{title}</span>
                        <span className="block text-13-5 leading-[1.6] text-muted">{body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              {contact && (
                <p className="flex items-center gap-2 text-13-5 text-muted">
                  <IconMail className="size-4 shrink-0 text-brand-ink" aria-hidden />
                  <span>
                    Questions before applying?{" "}
                    <a href={`mailto:${contact}`} className="font-medium text-brand-ink underline-offset-2 hover:underline">{contact}</a>
                  </span>
                </p>
              )}

              {otherRoles.length > 0 && (
                <section>
                  <h3 className="mb-4 text-15-5 font-semibold">Other open roles</h3>
                  <Collection kind="vacancies" cols={1} gap="sm">
                    {otherRoles.map((o) => (
                      <Tile
                        key={o.id}
                        href={`/careers/${o.slug}`}
                        title={o.title}
                        kicker={o.department ?? undefined}
                        summary={`${locationLabel(o)} · ${o.employment_type_label}`}
                        hue={hueFor(o.slug)}
                        padding="sm"
                        cta="See the role"
                      />
                    ))}
                  </Collection>
                </section>
              )}
            </div>
          </div>
        </Container>
      </section>

      {/*
        `JobPosting` is what puts this into Google Jobs, where people looking
        for work actually search. `datePosted` and `hiringOrganization` are
        required; `validThrough` and `baseSalary` are what make a posting rank,
        and both are omitted rather than faked when we do not have them.
      */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: job.title,
          description: job.description || job.summary || job.title,
          datePosted: job.published_at,
          ...(job.closes_at ? { validThrough: job.closes_at } : {}),
          employmentType: job.employment_type_schema,
          hiringOrganization: { "@type": "Organization", name: company, sameAs: site },
          /*
           * Google will not index a posting that has neither `jobLocation` nor
           * `jobLocationType`, so a role with no location has to say it is
           * remote rather than say nothing. `applicantLocationRequirements`
           * goes with TELECOMMUTE — without it Google reads the role as open
           * to the entire world.
           */
          ...(job.location
            ? {
                jobLocation: {
                  "@type": "Place",
                  address: { "@type": "PostalAddress", addressLocality: job.location, addressCountry: "IN" },
                },
              }
            : {
                jobLocationType: "TELECOMMUTE",
                applicantLocationRequirements: { "@type": "Country", name: "IN" },
              }),
          // The vacancy's own stable id, so Google can tell a re-post from a
          // second opening, and `directApply` because the form is on this page
          // rather than behind a third-party job board.
          identifier: { "@type": "PropertyValue", name: company, value: String(job.id) },
          directApply: true,
          ...(job.salary
            ? {
                baseSalary: {
                  "@type": "MonetaryAmount",
                  currency: job.salary.currency,
                  value: {
                    "@type": "QuantitativeValue",
                    ...(job.salary.min ? { minValue: job.salary.min } : {}),
                    ...(job.salary.max ? { maxValue: job.salary.max } : {}),
                    unitText: job.salary.period === "month" ? "MONTH" : "YEAR",
                  },
                },
              }
            : {}),
        }}
      />
    </>
  );
}
