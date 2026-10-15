import { Container } from "@/components/ui/container";
import { SupportNetwork } from "@/components/support/support-network";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import type { SupportNetworkSectionData } from "@/types/page-sections";
import { SectionFrame, SectionHead } from "./section-parts";

/**
 * The support network as a builder section (0.170.0, docs/support-network.md):
 * the same map and cards as `/support-network`, live from the API, optionally
 * opened on one country. Under the section's `h2` the countries are `h3`.
 */
export function SupportNetworkSection({ data, reveal }: { data: SupportNetworkSectionData; reveal?: SectionRevealAttr | null }) {
  return (
    <SectionFrame type="support_network" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <SupportNetwork centres={data.centres} headingLevel={data.heading ? 3 : 2} country={data.country} />
      </Container>
    </SectionFrame>
  );
}
