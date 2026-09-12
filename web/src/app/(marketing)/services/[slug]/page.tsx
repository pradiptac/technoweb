import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { CtaBand } from "@/components/ui/cta-band";
import { FaqList } from "@/components/ui/faq";
import { PageHero } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { IconArrowRight } from "@/components/icons";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Service } from "@/types/api";

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

  const faqs = service.faqs ?? [];

  return (
    <>
      <PageHero
        section="services"
        kicker="Web service"
        title={service.title}
        lede={service.summary}
        crumbs={[
          { name: "Web services", path: "/services" },
          { name: service.title, path: `/services/${service.slug}` },
        ]}
      >
        <ButtonLink href={`/contact?subject=${encodeURIComponent(service.title)}`}>
          Enquire about {service.title.toLowerCase()} <IconArrowRight />
        </ButtonLink>
      </PageHero>

      <Container data-aos="fade-up" className="section-y">
        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
          <div className="min-w-0">
            {service.body && <ProseWithShortcodes html={service.body} />}
            {faqs.length > 0 && <div className="mt-12"><FaqList faqs={faqs} /></div>}
          </div>

          <aside>
            <div className="rounded-xl border border-line-strong bg-surface p-6 lg:sticky lg:top-24">
              <h2 className="text-[17px]">Ask about {service.title.toLowerCase()}</h2>
              <p className="mt-1.5 mb-5 text-[13.5px] text-muted">
                No sales sequence — an engineer reads it and replies.
              </p>
              <EnquiryForm source={`service:${service.slug}`} subject={service.title} compact />
            </div>
          </aside>
        </div>
      </Container>

      <CtaBand />

      {service.schema && <JsonLd data={service.schema} />}
    </>
  );
}
