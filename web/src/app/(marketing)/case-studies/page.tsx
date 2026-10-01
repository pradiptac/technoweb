import Image from "next/image";
import { Collection, Tile } from "@/components/ui/collection";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconBuilding } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { CaseStudy } from "@/types/api";
import { CountUp } from "@/components/ui/count-up";
import { brandName } from "@/lib/brand";

export const metadata = buildMetadata({
  title: "Case studies",
  description:
    `Selected ${brandName()} deployments across manufacturing, healthcare and corporate sites — with the outcomes measured, not asserted.`,
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
          <Collection kind="case-studies" cols={3} gap="lg">
            {studies.map((c, i) => (
              <Tile
                key={c.id}
                href={`/case-studies/${c.slug}`}
                titleAs="h2"
                kicker={c.industry?.name}
                title={c.title}
                summary={c.summary}
                focus={c.cover_image_focus}
                media={c.cover_image ? (
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
                ) : (
                  <span data-tile-well className="grid size-full place-items-center bg-linear-135 from-brand-800 to-brand-600">
                    <IconBuilding className="size-10 text-white/30" />
                  </span>
                )}
                meta={c.results && c.results.length > 0 && (
                  <dl data-tile-results className="flex gap-5.5 border-t border-line pt-4">
                    {c.results.slice(0, 2).map((r) => (
                      <div key={r.label}>
                        <CountUp as="dd" value={r.value} className="block font-display text-lg font-semibold tracking-[-.02em] text-ink" />
                        <dt className="text-xs text-muted">{r.label}</dt>
                      </div>
                    ))}
                  </dl>
                )}
                cta="Read the case study"
              />
            ))}
          </Collection>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
