import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ErrorState } from "@/components/ui/empty";
import { Collection, Tile } from "@/components/ui/collection";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { Industry } from "@/types/api";

export const metadata = buildMetadata({
  title: "Industries",
  description:
    "IT infrastructure for healthcare, education, manufacturing, corporate, government and small business — built for how each one actually fails.",
  path: "/industries",
});

export default async function IndustriesPage() {
  let industries: Industry[] = [];
  let failed = false;

  try {
    industries = (await publicApi.industries()).data;
  } catch (error) {
    // Never ship a prerendered error page — break the build instead.
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        section="industries"
        kicker="Industries"
        title="Different floors, different failure modes."
        lede="A hospital network and a factory network fail in completely different ways. We build for the one you actually run."
        crumbs={[{ name: "Industries", path: "/industries" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {failed ? (
          <ErrorState title="We could not load the industries list">Refresh in a moment.</ErrorState>
        ) : (
          <Collection kind="industries" cols={3} gap="sm">
            {industries.map((i) => (
              <Tile
                key={i.id}
                href={`/industries/${i.slug}`}
                titleAs="h2"
                title={i.name}
                summary={i.summary}
                icon={<IconTile name={i.icon} fallback="building" />}
                hue={hueForIcon(i.icon, "building")}
                cta="See how we build for it"
              />
            ))}
          </Collection>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
