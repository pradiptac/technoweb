import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { ServiceCatalogue } from "@/components/services/service-catalogue";
import type { Service, ServiceCategory } from "@/types/api";

/**
 * The homepage's Services section: every published service, one tab per
 * service category, drawn in each theme's idiom (`ServiceCatalogue`). It
 * replaced the static "Web services" grid on 2026-09-29 — six entries in
 * `content/site.ts` that mirrored the seeded services, so editing a service
 * in the console changed every page but this one. The section keeps that
 * grid's anchor (`#services`), its backdrop and its slot id (`web`), so a
 * theme's stored order, background and switch for it still apply.
 */
export function Services({
  services, categories,
  kicker = "Services",
  title = "What we do on site and online.",
  lede = "Hardware repaired, networks installed, and the web side run by the same team — one vendor, one number to call.",
}: {
  services: Service[];
  categories: ServiceCategory[];
  /** A theme whose own section already says "Services" (Enterprise, Horizon) names this one differently. */
  kicker?: string;
  title?: string;
  lede?: string;
}) {
  if (services.length === 0) return null;

  return (
    <section id="services" className="relative overflow-hidden section-y-lg">
      {/* Decorative only — see the note on `.pattern-fade` in globals.css. */}
      <div
        aria-hidden
        className="pattern-fade pointer-events-none absolute inset-0 opacity-40 [background-image:url(/patterns/network-mesh.svg)] [background-size:1400px_auto] [background-position:center] [background-repeat:no-repeat]"
      />
      <Container className="relative">
        <SectionHeader kicker={kicker} title={title} lede={lede} />
        <ServiceCatalogue fill services={services} categories={categories} />
        <div className="mt-6.5">
          <ButtonLink href="/services" variant="secondary">
            All services <IconArrowRight />
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
