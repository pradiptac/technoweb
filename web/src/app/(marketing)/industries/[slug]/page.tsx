import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { ArrowLink } from "@/components/ui/button";
import { Card, CardHead } from "@/components/ui/card";
import { ApiError, publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Industry } from "@/types/api";

async function load(slug: string): Promise<Industry | null> {
  try {
    return (await publicApi.industry(slug)).data;
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
  const industry = await load(slug);

  if (!industry) return buildMetadata({ title: "Not found", path: `/industries/${slug}`, seo: noIndex });

  return buildMetadata({
    title: `IT infrastructure for ${industry.name}`,
    description: industry.summary,
    path: `/industries/${industry.slug}`,
    seo: industry.seo,
  });
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const industry = await load(slug);

  if (!industry) notFound();

  const solutions = industry.solutions ?? [];

  return (
    <>
      <PageHero
        section="industries"
        kicker="Industry"
        title={`Infrastructure for ${industry.name.toLowerCase()}`}
        lede={industry.summary}
        crumbs={[
          { name: "Industries", path: "/industries" },
          { name: industry.name, path: `/industries/${industry.slug}` },
        ]}
      />

      <Container data-aos="fade-up" className="section-y">
        {industry.body && <ProseWithShortcodes html={industry.body} className="mb-14" />}

        {solutions.length > 0 && (
          <section>
            <h2 className="display-3 mb-6">Where we usually start</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {solutions.map((s) => {
                return (
                  <Card key={s.id} beam>
                    <CardHead iconName={s.icon} className="text-[17px]">{s.title}</CardHead>
                    <p className="text-[14.5px] leading-[1.58] text-muted">{s.summary}</p>
                    <ArrowLink href={`/solutions/${s.slug}`} className="mt-4">Read more</ArrowLink>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <p className="mt-12 text-[14.5px] text-muted">
          Not sure which applies to you?{" "}
          <Link href="/contact" className="font-semibold text-brand-ink hover:underline">
            Describe your setup
          </Link>{" "}
          and we will tell you what we would look at first.
        </p>
      </Container>

      <CtaBand />
    </>
  );
}
