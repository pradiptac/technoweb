import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Prose } from "@/components/ui/prose";
import { FaqList } from "@/components/ui/faq";
import { CtaBand } from "@/components/ui/cta-band";
import { ApiError, publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { CmsPage } from "@/types/api";

/**
 * CMS-managed standalone pages — privacy, terms, downloads and anything else
 * an editor adds later.
 *
 * A catch-all on a single top-level segment. Next resolves static segments
 * before dynamic ones, so this can never shadow /solutions, /products or any
 * other real route; it only ever sees paths nothing else claimed. An unknown
 * slug still 404s, exactly as it did before this route existed.
 */
async function load(slug: string): Promise<CmsPage | null> {
  try {
    const res = await publicApi.page(slug);
    return res.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await load(slug);

  if (!page) return buildMetadata({ title: "Not found", path: `/${slug}`, seo: noIndex });

  return buildMetadata({ title: page.title, path: `/${slug}`, seo: page.seo });
}

export default async function CmsPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await load(slug);

  if (!page) notFound();

  const updated = new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(page.updated_at));

  return (
    <>
      <PageHero
        title={page.title}
        crumbs={[{ name: "Home", path: "/" }, { name: page.title, path: `/${slug}` }]}
      />

      <Container className="py-16 lg:py-20" data-aos="fade-up">
        <div className="max-w-[72ch]">
          {page.body ? <Prose html={page.body} /> : null}

          {page.faqs && page.faqs.length > 0 && (
            <div className="mt-12">
              <FaqList faqs={page.faqs} heading="Common questions" />
            </div>
          )}

          <p className="mt-12 border-t border-line pt-5 text-[13px] text-muted">
            Last updated {updated}.
          </p>
        </div>
      </Container>

      <CtaBand />
    </>
  );
}
