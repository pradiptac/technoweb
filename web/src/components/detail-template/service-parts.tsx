import { ButtonLink } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import type { Crumb } from "@/components/ui/breadcrumbs";
import { IconArrowRight } from "@/components/icons";
import type { Service } from "@/types/api";

/*
 * The pieces of a service's page, lifted out of its route (0.161.0) so the
 * route and a detail template draw each from the same code
 * (docs/page-builder.md "Detail templates"). Moved verbatim.
 */

/** The theme's page heading, with the enquiry and site-visit buttons. */
export function ServiceHero({ service, crumbs }: { service: Service; crumbs: Crumb[] }) {
  return (
      <PageHero
        section="services"
        kicker="Web service"
        title={service.title}
        lede={service.summary}
        crumbs={crumbs}
      >
        <div className="flex flex-wrap gap-3">
          {/*
            The label holds a name of any length, so below `sm` it may wrap:
            "Enquire about domain registration" is 348px on one line, 6px past
            a 360px screen's gutters (the 0.129.0 probe measured it).
          */}
          <ButtonLink href={`/contact?subject=${encodeURIComponent(service.title)}`} className="max-w-full whitespace-normal text-center sm:whitespace-nowrap">
            Enquire about {service.title.toLowerCase()} <IconArrowRight />
          </ButtonLink>
          {/* An engineer on site, with this service preselected (docs/visits.md). */}
          <ButtonLink href={`/book-a-visit?service=${encodeURIComponent(service.slug)}`} variant="secondary">
            Book a site visit
          </ButtonLink>
        </div>
      </PageHero>
  );
}
