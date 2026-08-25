import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ErrorState } from "@/components/ui/empty";
import {
  IdentityIcon } from "@/components/icons";
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
        kicker="Web Services"
        title="The other half of your infrastructure."
        lede="Domains, hosting and business email managed by the same team that runs your office network — one vendor, one number to call."
        crumbs={[{ name: "Web services", path: "/services" }]}
      />

      <Container data-aos="fade-up" className="py-16 lg:py-20">
        {failed ? (
          <ErrorState title="We could not load the services list">Refresh in a moment.</ErrorState>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => {
              return (
                <Link
                  key={s.id}
                  href={`/services/${s.slug}`}
                  className="rounded-lg border border-line-strong bg-card p-5.5 transition-all duration-200 hover:border-brand-300 hover:shadow-1"
                >
                  <div className="mb-3 flex items-center gap-2.75">
                    <IdentityIcon name={s.icon} fallback="globe" className="size-[18px]" />
                    <h2 className="text-base">{s.title}</h2>
                  </div>
                  <p className="text-sm leading-[1.55] text-muted">{s.summary}</p>
                </Link>
              );
            })}
          </div>
        )}
      </Container>

      <CtaBand
        title="Moving a domain, or setting up email properly?"
        body="Tell us what you have now and we will handle the migration without the mailbox outage everyone dreads."
      />
    </>
  );
}
