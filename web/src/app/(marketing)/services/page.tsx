import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ErrorState } from "@/components/ui/empty";
import { ServiceCatalogue } from "@/components/services/service-catalogue";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { Service, ServiceCategory } from "@/types/api";

export const metadata = buildMetadata({
  title: "Services",
  description:
    "Web, hardware and installation services — hosting and email, repairs and support, cabling, CCTV and Wi-Fi — from the same engineers who run your office network.",
  path: "/services",
});

export default async function ServicesPage() {
  let services: Service[] = [];
  let categories: ServiceCategory[] = [];
  let failed = false;

  try {
    [services, categories] = await Promise.all([
      publicApi.services().then((r) => r.data),
      // Without categories the services are one untabbed grid — still the page.
      publicApi.serviceCategories().then((r) => r.data).catch(() => []),
    ]);
  } catch (error) {
    // Never ship a prerendered error page — break the build instead.
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        section="services"
        kicker="Services"
        title="Everything we set up, fix and look after."
        lede="Web services, hardware support and on-site installation from the same team that runs your office network — one vendor, one number to call."
        crumbs={[{ name: "Services", path: "/services" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {failed ? (
          <ErrorState title="We could not load the services list">Refresh in a moment.</ErrorState>
        ) : (
          // Every service, one tab per category; an index never fills, so nothing is cut.
          <ServiceCatalogue services={services} categories={categories} titleAs="h2" />
        )}
      </Container>

      <CtaBand
        title="Moving a domain, or setting up email properly?"
        body="Tell us what you have now and we will handle the migration without the mailbox outage everyone dreads."
      />
    </>
  );
}
