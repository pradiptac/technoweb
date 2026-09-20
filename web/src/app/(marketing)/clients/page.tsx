import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconBuilding } from "@/components/icons";
import { ClientWall } from "@/components/company/client-wall";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { Client } from "@/types/api";

export const metadata = buildMetadata({
  title: "Clients",
  description:
    "Some of the organisations Technoware supplies, installs and supports — across manufacturing, healthcare, education and the public sector.",
  path: "/clients",
});

export default async function ClientsPage() {
  let clients: Client[] = [];
  let failed = false;

  try {
    clients = (await publicApi.clients()).data;
  } catch (error) {
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        section="company"
        kicker="Clients"
        title="Who we work for."
        lede="A selection of the organisations whose networks we look after. Names are shown with permission; the rest are described by sector on the case studies."
        crumbs={[{ name: "Clients", path: "/clients" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {failed ? (
          <ErrorState title="We could not load the client list">Refresh in a moment.</ErrorState>
        ) : clients.length === 0 ? (
          <EmptyState icon={<IconBuilding />} title="Nothing listed yet">
            Clients are added from the console.
          </EmptyState>
        ) : (
          <ClientWall clients={clients} headingLevel={2} />
        )}
      </Container>

      <CtaBand />
    </>
  );
}
