import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { CtaBand } from "@/components/ui/cta-band";
import { IconArrowRight, IconTeam } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { buildMetadata, JsonLd } from "@/lib/seo";
import type { JobOpening } from "@/types/api";

export const revalidate = 120;

export const metadata = buildMetadata({
  title: "Careers",
  description: "Engineering, field and support roles at Technoware. See what is open and apply.",
  path: "/careers",
});

/** Groups roles by department, keeping the API's order within each group. */
function byDepartment(openings: JobOpening[]) {
  const groups = new Map<string, JobOpening[]>();

  for (const job of openings) {
    const key = job.department?.trim() || "Other roles";
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }

  return [...groups.entries()];
}

export default async function CareersPage() {
  let openings: JobOpening[];
  try {
    openings = (await publicApi.careers()).data;
  } catch {
    return (
      <>
        <PageHero kicker="Careers" title="Work at Technoware" />
        <Container className="section-y">
          <ErrorState title="We could not load the open roles">
            Something is wrong at our end. Try again shortly, or write to us and we will send you
            the current list.
          </ErrorState>
        </Container>
      </>
    );
  }

  const groups = byDepartment(openings);

  return (
    <>
      <PageHero
        kicker="Careers"
        title="Work at Technoware"
        lede="We design, deploy and support the networks other businesses run on. That work is done by engineers who like being trusted with it."
      />

      <Container className="section-y">
        {openings.length === 0 ? (
          /*
            An honest empty state. The alternative — inviting speculative
            applications — collects CVs nobody has a role for, and this
            product deletes them after six months either way.
          */
          <EmptyState icon={<IconTeam />} title="No open roles right now">
            We are not recruiting at the moment. It is worth checking back — roles here tend to
            open with a project rather than on a schedule.
          </EmptyState>
        ) : (
          <div className="space-y-12" data-aos="fade-up">
            {groups.map(([department, jobs]) => (
              <section key={department}>
                <h2 className="mb-4 text-[19px] font-semibold tracking-[-.01em]">{department}</h2>

                <ul className="space-y-3">
                  {jobs.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/careers/${job.slug}`}
                        className="group flex flex-col gap-3 rounded-lg border border-line-strong bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-2 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <h3 className="text-[17px] font-semibold text-ink">{job.title}</h3>
                          {job.summary && (
                            <p className="mt-1 max-w-[70ch] text-[14.5px] leading-[1.6] text-muted">
                              {job.summary}
                            </p>
                          )}
                          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            {job.location && <Badge tone="closed">{job.location}</Badge>}
                            <Badge tone="open">{job.employment_type_label}</Badge>
                            {job.experience && <Badge tone="closed">{job.experience.range}</Badge>}
                            {/* Only when a range was actually filled in. */}
                            {job.salary && <Badge tone="resolved">{job.salary.label}</Badge>}
                          </p>
                        </div>

                        <span className="flex shrink-0 items-center gap-1.5 text-[14px] font-semibold text-brand-ink sm:ml-auto">
                          View role
                          <IconArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Container>

      {/*
        `ItemList` of the open roles. Each posting emits its own `JobPosting` on
        its own page, which is what Google Jobs actually indexes; this is the
        index telling a crawler the pages exist.
      */}
      {openings.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: openings.map((job, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/careers/${job.slug}`,
              name: job.title,
            })),
          }}
        />
      )}

      <CtaBand
        title="Nothing that fits?"
        body="Tell us what you do and where you want to take it. We would rather know you exist before the role opens than after it closes."
      />
    </>
  );
}
