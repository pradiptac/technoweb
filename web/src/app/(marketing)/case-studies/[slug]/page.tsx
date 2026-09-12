import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { stripColumns } from "@/lib/strip-columns";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { CaseStudy } from "@/types/api";

async function load(slug: string): Promise<CaseStudy | null> {
  try {
    return (await publicApi.caseStudy(slug)).data;
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
  const study = await load(slug);

  if (!study) return buildMetadata({ title: "Not found", path: `/case-studies/${slug}`, seo: noIndex });

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
        section="resources"
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

      <Container data-aos="fade-up" className="section-y">
        {results.length > 0 && (
          <dl className={cn("mb-12 grid gap-px overflow-hidden rounded-xl border border-line-strong bg-line", stripColumns(results.length))}>
            {results.map((r) => (
              <div key={r.label} className="bg-card p-6">
                <dd className="font-display text-[30px] font-bold leading-none tracking-[-.03em] text-brand-ink">
                  {r.value}
                </dd>
                <dt className="mt-2 text-[13px] text-muted">{r.label}</dt>
              </div>
            ))}
          </dl>
        )}

        {study.cover_image && (
          /*
            An aspect ratio, because this is the one image on the site whose
            box is not already fixed.

            Every other cover and thumbnail sits in a well with a set height —
            h-40, h-44, h-56 — so a slow image cannot move anything. This one
            is full-width and unconstrained, so the whole article body below it
            jumps down the moment the image arrives. Nothing shifts today
            because the placeholder art is a 2KB SVG served from localhost;
            it will the day a real photograph lands, which is exactly the
            defect that is invisible until it is expensive.

            1200/630 is what the cover generator produces and what og:image
            wants, so a real photograph should be cut to it anyway.
          */
          <div className="relative mb-12 aspect-[1200/630] w-full overflow-hidden rounded-xl border border-line">
            <Image
              src={study.cover_image}
              alt={study.cover_image_alt ?? ""}
              fill
              sizes="(min-width: 1920px) 1728px, 90vw"
              priority
              className="object-cover"
            />
          </div>
        )}

        {study.body && <ProseWithShortcodes html={study.body} />}

        <p className="mt-12 border-t border-line pt-6">
          <Link href="/case-studies" className="inline-block py-1 text-[14px] font-semibold text-brand-ink hover:underline">
            ← All case studies
          </Link>
        </p>
      </Container>

      <CtaBand
        title="Similar setup to yours?"
        body="Most of these started as an audit. If the shape of the problem looks familiar, that is the place to begin."
      />

      {/*
        Built by the API, rendered here.
        See App\Support\StructuredData — the graph used to be assembled in this
        file, which is how the blog and the case study both ended up declaring
        `dateModified: published_at` and naming the Organization as author while
        the record carried an author_id. Escaping stays in `JsonLd`, because
        JSON.stringify does not escape `<` and a CMS field containing
        `</script>` would otherwise close the block.
      */}
      {study.schema && <JsonLd data={study.schema} />}
    </>
  );
}
