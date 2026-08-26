import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Badge } from "@/components/ui/badge";
import { Prose } from "@/components/ui/prose";
import { IconCheck } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { buildMetadata, JsonLd } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import type { JobOpening } from "@/types/api";
import { ApplyForm } from "./apply-form";

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
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

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
    <dl className="rounded-lg border border-line-strong bg-surface p-5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 border-b border-line py-2 last:border-b-0">
          <dt className="text-[13px] text-muted">{label}</dt>
          <dd className="text-right text-[13.5px] font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-9">
      <h2 className="mb-3 text-[19px] font-semibold tracking-[-.01em]">{title}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-[15px] leading-[1.65] text-ink-2">
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
  const job = await load(slug);

  if (!job) notFound();

  const settings = await getSiteSettings();
  const company = settings.company_name ?? "Technoware";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <>
      <PageHero
        kicker="Careers"
        title={job.title}
        lede={job.summary}
        crumbs={[{ name: "Careers", path: "/careers" }, { name: job.title, path: `/careers/${job.slug}` }]}
      />

      <Container className="section-y">
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <p className="mb-6 flex flex-wrap gap-2">
              <Badge tone="closed">{locationLabel(job)}</Badge>
              <Badge tone="open">{job.employment_type_label}</Badge>
              {job.experience && <Badge tone="closed">{job.experience.range}</Badge>}
              {job.salary && <Badge tone="resolved">{job.salary.label}</Badge>}
            </p>

            {job.description && <Prose html={job.description} />}

            <Bullets title="What you will do" items={job.responsibilities} />
            <Bullets title="What we are looking for" items={job.requirements} />

            {job.qualifications && job.qualifications.length > 0 && (
              <section className="mt-9">
                <h2 className="mb-3 text-[19px] font-semibold tracking-[-.01em]">Qualifications</h2>
                <p className="flex flex-wrap gap-2">
                  {job.qualifications.map((q) => <Badge key={q} tone="brand">{q}</Badge>)}
                </p>
                <p className="mt-2.5 text-[13.5px] text-muted">
                  Any one of these. If your background is close but not on the list, apply anyway
                  and say why.
                </p>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Facts job={job} company={company} />
          </aside>
        </div>

        <section id="apply" className="mt-14 max-w-[640px] scroll-mt-24">
          <h2 className="text-[22px] font-semibold tracking-[-.015em]">Apply for this role</h2>
          <p className="mt-1.5 mb-6 text-[14.5px] leading-[1.6] text-muted">
            A CV and a couple of lines about why. We read every application.
          </p>

          <ApplyForm slug={job.slug} title={job.title} />
        </section>
      </Container>

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
