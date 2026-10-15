import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { CtaBand } from "@/components/ui/cta-band";
import { Prose } from "@/components/ui/prose";
import { ButtonLink } from "@/components/ui/button";
import { TenderStateChip } from "@/components/tenders/tender-state";
import {
  TenderClosedNote,
  TenderContact,
  TenderDocuments,
  TenderGlance,
  TenderSubmission,
} from "@/components/tenders/tender-parts";
import { isTenderSlug } from "@/components/tenders/data";
import { ApiError, publicApi } from "@/lib/api";
import { buildMetadata, JsonLd } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { TenderDetail } from "@/types/tenders";

/*
 * One tender's notice (0.174.0, docs/tenders.md).
 */

async function load(slug: string): Promise<TenderDetail | null> {
  if (!isTenderSlug(slug)) return null;

  try {
    return (await publicApi.tender(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * **The export's existence is what enters this route into the ISR cache.**
 * In Next 16 a dynamic segment is cached only when it exports
 * `generateStaticParams`; without it the page is rendered on every request
 * whatever its fetches are cached as. The empty list means nothing is
 * enumerated at build — each notice renders on its first request and is
 * cached from then on.
 *
 * **What that costs:** a request-time API in this render — `cookies()`,
 * `headers()`, `searchParams`, a `no-store` fetch — is a 500 ("Page changed
 * from static to dynamic at runtime"), not a fallback. That is precisely
 * why the state chip asks for the live state from a *client* island after
 * mount rather than from here.
 */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tender = await load(slug);

  // The route answers 404, but `generateMetadata` has already run and
  // would otherwise say "index, follow" about a page that is not there.
  if (!tender) return buildMetadata({ title: "Tender not found", path: `/tenders/${slug}`, seo: noIndex });

  return buildMetadata({
    title: tender.title,
    description: tender.summary ?? `Tender ${tender.reference}. Closes ${tender.closes_label}.`,
    path: `/tenders/${tender.slug}`,
    seo: tender.seo ?? undefined,
  });
}

export default async function TenderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tender = await load(slug);

  if (!tender) notFound();

  return (
    <>
      <PageHero
        section="company"
        kicker={tender.reference}
        title={tender.title}
        lede={tender.summary ?? undefined}
        crumbs={[
          { name: "Tenders", path: "/tenders" },
          { name: tender.title, path: `/tenders/${tender.slug}` },
        ]}
      >
        {/*
          The one island on the page, and the reason the page is safe to
          cache: it re-asks the uncached state after mount, so a notice that
          closed since this HTML was built says so.
        */}
        <TenderStateChip
          slug={tender.slug}
          onDark
          initial={{
            state: tender.state,
            state_label: tender.state_label,
            closes_in_label: tender.closes_in_label,
            closed: tender.closed,
          }}
        />
      </PageHero>

      <Container className="section-y">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
          <div className="grid min-w-0 gap-10" data-aos="fade-up">
            <TenderClosedNote tender={tender} />
            <TenderGlance tender={tender} />

            {tender.description && (
              <section>
                <h2 className="display-3 mb-4">Scope of work</h2>
                <Prose html={tender.description} />
              </section>
            )}

            <TenderDocuments documents={tender.documents} />
            <TenderSubmission tender={tender} />
            <TenderContact tender={tender} />
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start" data-aos="fade-up">
            <div className="grid gap-4 rounded-lg border border-line-strong bg-surface p-5">
              <div>
                <p className="text-12-5 font-semibold uppercase tracking-wide text-muted">Last date for submission</p>
                <p className="mt-1 text-16 font-semibold text-ink">
                  <time dateTime={tender.closes_at}>{tender.closes_label}</time>
                </p>
              </div>
              <TenderStateChip
                slug={tender.slug}
                initial={{
                  state: tender.state,
                  state_label: tender.state_label,
                  closes_in_label: tender.closes_in_label,
                  closed: tender.closed,
                }}
              />
              <ButtonLink href="/tenders" variant="secondary" className="w-full justify-center">
                All tenders
              </ButtonLink>
            </div>
          </aside>
        </div>
      </Container>

      {tender.schema && <JsonLd data={tender.schema} />}

      <CtaBand />
    </>
  );
}
