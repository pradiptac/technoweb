import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ErrorState } from "@/components/ui/empty";
import { Collection, Tile } from "@/components/ui/collection";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { Service } from "@/types/api";

export const metadata = buildMetadata({
  title: "Web services",
  description:
    "Domain registration, web hosting, business email, SSL certificates and VPS — managed by the same engineers who run your office network.",
  path: "/services",
});

export default async function ServicesPage() {
  let services: Service[] = [];
  let failed = false;

  try {
    services = (await publicApi.services()).data;
  } catch (error) {
    // Never ship a prerendered error page — break the build instead.
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        section="services"
        kicker="Web Services"
        title="The other half of your infrastructure."
        lede="Domains, hosting and business email managed by the same team that runs your office network — one vendor, one number to call."
        crumbs={[{ name: "Web services", path: "/services" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {failed ? (
          <ErrorState title="We could not load the services list">Refresh in a moment.</ErrorState>
        ) : (
          <Collection kind="services" cols={3}>
            {services.map((s) => (
              <Tile
                key={s.id}
                href={`/services/${s.slug}`}
                titleAs="h2"
                title={s.title}
                summary={s.summary}
                icon={<IconTile name={s.icon} fallback="globe" />}
                hue={hueForIcon(s.icon, "globe")}
                cta="Learn more"
              />
            ))}
          </Collection>
        )}
      </Container>

      <CtaBand
        title="Moving a domain, or setting up email properly?"
        body="Tell us what you have now and we will handle the migration without the mailbox outage everyone dreads."
      />
    </>
  );
}
