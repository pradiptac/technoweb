import Image from "next/image";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconShield } from "@/components/icons";
import { CertificationCards } from "@/components/company/certification-cards";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { Brand, Certification } from "@/types/api";

export const metadata = buildMetadata({
  title: "Certifications",
  description:
    "The standards Technoware is certified to, the vendors it is an authorised partner of, and the certificates behind both.",
  path: "/certifications",
});

/**
 * Two lists on one page. The company's own certifications, from the
 * certifications table, and the vendor partnerships — which are a fact about
 * a brand the catalogue already holds, so they come from `/brands?partners=1`
 * rather than a second logo table.
 *
 * The partner strip is supplementary and caught separately: a brands
 * endpoint blinking must not take the certificates page down with it.
 */
export default async function CertificationsPage() {
  let items: Certification[] = [];
  let failed = false;

  try {
    items = (await publicApi.certifications()).data;
  } catch (error) {
    if (isPrerendering) throw error;
    failed = true;
  }

  const partners: Brand[] = await publicApi.partnerBrands().then((r) => r.data).catch(() => []);

  return (
    <>
      <PageHero
        section="company"
        kicker="Certifications"
        title="Accountable on paper, too."
        lede="The standards we are audited against and the vendors who have authorised us to sell and support their equipment. Every certificate here is current; a lapsed one comes off the page."
        crumbs={[{ name: "Certifications", path: "/certifications" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {failed ? (
          <ErrorState title="We could not load the certifications">Refresh in a moment.</ErrorState>
        ) : items.length === 0 ? (
          <EmptyState icon={<IconShield />} title="Nothing listed yet">
            Certifications are added from the console.
          </EmptyState>
        ) : (
          <CertificationCards items={items} headingLevel={2} />
        )}

        {partners.length > 0 && (
          <section aria-labelledby="partners" className="mt-16" data-aos="fade-up">
            <h2
              id="partners"
              className="mb-6 text-[22px] font-semibold after:mt-2.5 after:block after:h-[3px] after:w-10 after:rounded-full after:bg-brand-600"
            >
              Authorised partner
            </h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {partners.map((b) => (
                <li key={b.id} className="rounded-lg border-2 border-line-strong bg-card p-3">
                  <span className="relative block aspect-[3/2] w-full overflow-hidden rounded-md bg-surface-2">
                    {b.logo ? (
                      <Image src={b.logo} alt="" fill sizes="(min-width: 1280px) 15vw, (min-width: 640px) 33vw, 50vw" className="brand-logo object-contain p-4" />
                    ) : (
                      <span aria-hidden className="grid size-full place-items-center font-display text-[15px] font-semibold text-faint">
                        {b.name}
                      </span>
                    )}
                  </span>
                  <span className="mt-3 block">
                    <span className="block text-[14px] font-semibold leading-snug">{b.name}</span>
                    {b.partner_tier && <span className="mt-0.5 block text-[12px] text-muted">{b.partner_tier}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
