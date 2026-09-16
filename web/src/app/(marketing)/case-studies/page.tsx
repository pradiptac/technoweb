import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconBuilding } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { CaseStudy } from "@/types/api";

export const metadata = buildMetadata({
  title: "Case studies",
  description:
    "Selected Technoware deployments across manufacturing, healthcare and corporate sites — with the outcomes measured, not asserted.",
  path: "/case-studies",
});

export default async function CaseStudiesIndex() {
  let studies: CaseStudy[] = [];
  let failed = false;

  try {
    studies = (await publicApi.caseStudies()).data;
  } catch (error) {
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        section="resources"
        kicker="Case studies"
        title="Projects, with the numbers attached."
        lede="Selected deployments where the brief was clear, the constraints were real and the outcome is measurable. Client names are used with permission; where they are not, the sector is."
        crumbs={[{ name: "Case studies", path: "/case-studies" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {failed ? (
          <ErrorState title="We could not load the case studies">Refresh in a moment.</ErrorState>
        ) : studies.length === 0 ? (
          <EmptyState icon={<IconBuilding />} title="Nothing published yet">
            Write-ups of recent projects are in progress.
          </EmptyState>
        ) : (
          <ul className="grid items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3">
            {studies.map((c, i) => (
              <li key={c.id}>
                <Link
                  href={`/case-studies/${c.slug}`}
                  className="flex h-full flex-col overflow-hidden rounded-lg border border-line-strong bg-card transition-all duration-(--duration-base) hover:-translate-y-0.5 hover:shadow-2"
                >
                  {c.cover_image ? (
                    <div className="relative aspect-[4/3] w-full">
                      <Image
                        src={c.cover_image}
                        alt={c.cover_image_alt ?? ""}
                        fill
                        sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                        // The first row is above the fold under every theme, and under
                        // one whose hero has no banner (Datacenter) its cover is the
                        // LCP: eager, never `priority` — a preload would ride on every
                        // page linking here.
                        loading={i < 3 ? "eager" : undefined}
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="grid aspect-[4/3] place-items-center bg-linear-135 from-brand-800 to-brand-600">
                      <IconBuilding className="size-10 text-white/30" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5.5">
                    {c.industry?.name && (
                      <span className="text-11 font-semibold uppercase tracking-[.1em] text-brand-ink">
                        {c.industry.name}
                      </span>
                    )}
                    <h2 className="mt-2 text-17 leading-snug">{c.title}</h2>
                    {c.summary && (
                      <p className="mt-2 text-14 leading-[1.55] text-muted">{c.summary}</p>
                    )}
                    {c.results && c.results.length > 0 && (
                      <dl className="mt-auto flex gap-5.5 border-t border-line pt-4">
                        {c.results.slice(0, 2).map((r) => (
                          <div key={r.label}>
                            <dd className="block font-display text-lg font-semibold tracking-[-.02em]">{r.value}</dd>
                            <dt className="text-xs text-muted">{r.label}</dt>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
