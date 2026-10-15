import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { RelatedEntities } from "@/components/content/related-entities";
import { RecordSections, hasEntityLinks, laidOutAsSections } from "@/components/page-sections/record-sections";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Service } from "@/types/api";
import { ServiceHero } from "@/components/detail-template/service-parts";
import { ServiceTemplate } from "@/components/detail-template/service-template";
import { EnquiryCard } from "@/components/forms/enquiry-card";

async function load(slug: string): Promise<Service | null> {
  try {
    return (await publicApi.service(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/*
 * Empty on purpose, and the export itself is the feature.
 *
 * In Next 16 a dynamic-segment route is entered into the ISR route cache only
 * when it exports `generateStaticParams` — without it the page is rendered on
 * every request, whatever the fetches inside it are cached as, and never
 * sends an `x-nextjs-cache` header. Every `[slug]` route in this site was in
 * that state, measured at 1.5–4.5s TTFB against a local API. Returning `[]`
 * enumerates nothing at build (the build already needs the API reachable;
 * rendering every record would slow it for no visitor) and lets each path
 * render on its first request and be served from the cache until its tags
 * are invalidated or the shortest `revalidate` among its fetches expires.
 *
 * **What it costs**: a request-time API — `cookies()`, `headers()`,
 * `searchParams` — or a `cache: "no-store"` fetch anywhere in this render is
 * no longer a silent fallback to dynamic rendering; it is a 500 ("Page changed
 * from static to dynamic at runtime"). Everything this page reads is ISR-tagged
 * through `publicApi`, and the only thing on it that touches a cookie is a
 * Server Action, which runs on submit rather than on render. Keep it that way.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await load(slug);

  if (!service) return buildMetadata({ title: "Not found", path: `/services/${slug}`, seo: noIndex });

  return buildMetadata({
    title: service.title,
    description: service.summary,
    path: `/services/${service.slug}`,
    seo: service.seo,
  });
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await load(slug);

  if (!service) notFound();

  // An active detail template lays the page out (0.161.0, docs/page-builder.md "Detail templates"); with none, the page below is unchanged.
  if (service.detail_template) return <ServiceTemplate service={service} />;

  const faqs = service.faqs ?? [];
  const crumbs = [
    { name: "Services", path: "/services" },
    { name: service.title, path: `/services/${service.slug}` },
  ];

  /*
   * The body laid out as builder sections (0.129.0, docs/page-builder.md
   * "Sections on other records"): full-width bands under the heading, where
   * the written body stood. The details, the answers and the enquiry form
   * keep their place under them — beside each other when there is anything
   * to put beside the form, and the form on its own, centred, when not.
   */
  const laidOut = laidOutAsSections(service);
  const hasDetails = (service.custom_fields?.length ?? 0) > 0 || (service.answer_blocks?.length ?? 0) > 0
    || faqs.length > 0 || hasEntityLinks(service.entity);

  const enquiry = <EnquiryCard source={`service:${service.slug}`} subject={service.title} name={service.title.toLowerCase()} />;

  return (
    <>
      <ServiceHero service={service} crumbs={crumbs} />

      {laidOut && <RecordSections sections={service.sections ?? []} crumbs={crumbs} />}

      {laidOut && !hasDetails ? (
        <Container data-aos="fade-up" className="section-y">
          <div className="mx-auto w-full max-w-xl">{enquiry}</div>
        </Container>
      ) : (
      <Container data-aos="fade-up" className="section-y">
        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
          <div className={laidOut ? "min-w-0 *:first:mt-0" : "min-w-0"}>
            {!laidOut && service.body && <ProseWithShortcodes html={service.body} />}
            {/* The answer blocks (FAQs merged into their questions), then what the record is connected to. */}
            {/* Custom fields in "details" groups (docs/custom-content.md): nothing when there are none. */}
            <CustomFieldDetails fields={service.custom_fields} className="mt-12" />
            <AnswerBlocks blocks={service.answer_blocks} faqs={faqs} className="mt-12" />
            <RelatedEntities entity={service.entity} className="mt-12" />
          </div>

          <aside>
            {enquiry}
          </aside>
        </div>
      </Container>
      )}

      <CtaBand />

      {service.schema && <JsonLd data={service.schema} />}
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {service.faq_schema && <JsonLd data={service.faq_schema} />}
    </>
  );
}
