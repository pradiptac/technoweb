import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { CtaBand } from "@/components/ui/cta-band";
import { FaqList } from "@/components/ui/faq";
import { PageHero } from "@/components/ui/page-hero";
import { Prose } from "@/components/ui/prose";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata, jsonLd } from "@/lib/seo";
import type { Solution } from "@/types/api";

async function load(slug: string): Promise<Solution | null> {
  try {
    return (await publicApi.solution(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const solution = await load(slug);

  if (!solution) return buildMetadata({ title: "Not found", path: `/solutions/${slug}` });

  return buildMetadata({
    title: solution.title,
    description: solution.summary,
    path: `/solutions/${solution.slug}`,
    image: solution.hero_image,
    seo: solution.seo,
  });
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const solution = await load(slug);

  if (!solution) notFound();

  const benefits = solution.benefits ?? [];
  const technologies = solution.technologies ?? [];
  const products = solution.products ?? [];
  const industries = solution.industries ?? [];
  const faqs = solution.faqs ?? [];

  return (
    <>
      <PageHero
        kicker="Solution"
        title={solution.title}
        lede={solution.summary}
        crumbs={[
          { name: "Solutions", path: "/solutions" },
          { name: solution.title, path: `/solutions/${solution.slug}` },
        ]}
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/contact?subject=${encodeURIComponent(solution.title)}`}>
            Talk to an engineer <IconArrowRight />
          </ButtonLink>
          <ButtonLink href="/products" variant="secondary">Browse related hardware</ButtonLink>
        </div>
      </PageHero>

      <Container data-aos="fade-up" className="py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_320px] lg:gap-16">
          <div className="min-w-0">
            {solution.problem_statement && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3">The problem</h2>
                <p className="lede mt-4">{solution.problem_statement}</p>
              </section>
            )}

            {solution.overview && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3 mb-4">What we do</h2>
                <Prose html={solution.overview} />
              </section>
            )}

            {benefits.length > 0 && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3">What you get</h2>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {benefits.map((b) => (
                    <li key={b} className="flex items-start gap-3 rounded-lg border border-line-strong bg-white p-4">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
                      <span className="text-[14.5px] leading-[1.55]">{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {faqs.length > 0 && <section data-aos="fade-up" className="mb-4"><FaqList faqs={faqs} /></section>}
          </div>

          <aside className="grid content-start gap-5">
            {technologies.length > 0 && (
              <div className="rounded-xl border border-line-strong bg-surface p-5.5">
                <h2 className="text-[15.5px]">Technologies we deploy</h2>
                <ul className="mt-3.5 flex flex-wrap gap-2">
                  {technologies.map((t) => (
                    <li key={t} className="rounded-full border border-line-strong bg-white px-3 py-1.5 font-mono text-[12px] text-muted">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {products.length > 0 && (
              <div className="rounded-xl border border-line-strong bg-white p-5.5">
                <h2 className="text-[15.5px]">Hardware we use here</h2>
                <ul className="mt-3.5 grid gap-2.5">
                  {products.slice(0, 6).map((p) => (
                    <li key={p.id}>
                      <Link href={`/products/${p.slug}`} className="block py-1 text-[14px] hover:text-brand-600 hover:underline">
                        {p.brand?.name ? `${p.brand.name} ` : ""}{p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {industries.length > 0 && (
              <div className="rounded-xl border border-line-strong bg-white p-5.5">
                <h2 className="text-[15.5px]">Common in</h2>
                <ul className="mt-3.5 flex flex-wrap gap-2">
                  {industries.map((i) => (
                    <li key={i.id}>
                      <Link href={`/industries/${i.slug}`} className="block rounded-full border border-line-strong px-3 py-1.5 text-[13px] hover:border-brand-300 hover:bg-brand-50">
                        {i.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </Container>

      <CtaBand
        title={`Thinking about ${solution.title.toLowerCase()}?`}
        body="Start with a site visit. We will tell you what your current setup can still do, and what genuinely needs replacing."
      />

      <JsonLd data={jsonLd.service({ title: solution.title, summary: solution.summary, slug: solution.slug })} />
    </>
  );
}
