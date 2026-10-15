import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconMapPin } from "@/components/icons-ui";
import { SupportNetwork } from "@/components/support/support-network";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata, JsonLd } from "@/lib/seo";
import { brandName } from "@/lib/brand";
import type { SupportCentre } from "@/types/support";

export const metadata = buildMetadata({
  title: "Support network",
  description: `Where ${brandName()} is near you: our service centres and offices, with their addresses and telephone numbers.`,
  path: "/support-network",
});

/**
 * The support network (0.170.0, docs/support-network.md): every active
 * centre on one map and in one list, country by country. Prerendered and
 * tagged `support-centres`, which the console's save purges.
 */
export default async function SupportNetworkPage() {
  let centres: SupportCentre[] = [];
  let schema: Record<string, unknown> | null = null;
  let failed = false;

  try {
    const res = await publicApi.supportCentres();
    centres = res.data;
    schema = res.meta.schema;
  } catch (error) {
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      {schema && <JsonLd data={schema as Parameters<typeof JsonLd>[0]["data"]} />}
      <PageHero
        section="support"
        kicker="Support network"
        title="Help is nearby."
        lede="Our service centres and offices, with how to reach each one. Press a pin to find its details, or choose a country."
        crumbs={[{ name: "Support network", path: "/support-network" }]}
      />

      <Container className="section-y">
        {failed ? (
          <ErrorState title="We could not load the support network">Refresh in a moment.</ErrorState>
        ) : centres.length === 0 ? (
          <EmptyState icon={<IconMapPin />} title="No centres listed yet">
            Centres are added from the console.
          </EmptyState>
        ) : (
          <SupportNetwork centres={centres} />
        )}
      </Container>

      <CtaBand />
    </>
  );
}
