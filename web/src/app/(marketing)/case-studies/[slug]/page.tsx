import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { Prose } from "@/components/ui/prose";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, SITE, buildMetadata } from "@/lib/seo";
import type { CaseStudy } from "@/types/api";

async function load(slug: string): Promise<CaseStudy | null> {
  try {
    return (await publicApi.caseStudy(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = await load(slug);

  if (!study) return buildMetadata({ title: "Not found", path: `/case-studies/${slug}` });

  return buildMetadata({
    title: `${study.title} — case study`,
    description: study.summary,
    path: `/case-studies/${study.slug}`,
    image: study.cover_image,
    type: "article",
    seo: study.seo,
  });
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = await load(slug);

  if (!study) notFound();

  const results = study.results ?? [];

  return (
    <>
      <PageHero
        kicker={study.industry?.name ?? "Case study"}
        title={study.title}
        lede={study.summary}
        crumbs={[
          { name: "Case studies", path: "/case-studies" },
          { name: study.title, path: `/case-studies/${study.slug}` },
        ]}
      >
        {study.client_name && (
          <p className="text-[14px] text-muted">
            Client: <strong className="font-semibold text-ink">{study.client_name}</strong>
          </p>
        )}
      </PageHero>

      <Container data-aos="fade-up" className="py-16 lg:py-20">
        {results.length > 0 && (
          <dl className="mb-12 grid gap-px overflow-hidden rounded-xl border border-line-strong bg-line sm:grid-cols-2 lg:grid-cols-4">
            {results.map((r) => (
              <div key={r.label} className="bg-white p-6">
                <dd className="font-display text-[30px] font-bold leading-none tracking-[-.03em] text-brand-700">
                  {r.value}
                </dd>
                <dt className="mt-2 text-[13px] text-muted">{r.label}</dt>
              </div>
            ))}
          </dl>
        )}

        {study.cover_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={study.cover_image} alt="" className="mb-12 w-full rounded-xl border border-line object-cover" />
        )}

        {study.body && <Prose html={study.body} />}

        <p className="mt-12 border-t border-line pt-6">
          <Link href="/case-studies" className="inline-block py-1 text-[14px] font-semibold text-brand-600 hover:underline">
            ← All case studies
          </Link>
        </p>
      </Container>

      <CtaBand
        title="Similar setup to yours?"
        body="Most of these started as an audit. If the shape of the problem looks familiar, that is the place to begin."
      />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: study.title,
          description: study.summary ?? undefined,
          image: study.cover_image ?? undefined,
          author: { "@type": "Organization", name: SITE.name, url: SITE.url },
          publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
          mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE.url}/case-studies/${study.slug}` },
        }}
      />
    </>
  );
}
