import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
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
        // Home is not passed: `Breadcrumbs` prepends it. Passing it here too
        // rendered it twice on every CMS page, collided `key={c.path}` on "/"
        // — a React duplicate-key error on each of them — and put Home into the
        // BreadcrumbList structured data twice, which is what Google reads.
        crumbs={[{ name: page.title, path: `/${slug}` }]}
      />

      {/*
        Two templates, and the difference is the measure.
 
        `default` caps the body at 72ch, which is what prose wants and what
        every policy page here is. `wide` drops the cap, for a page built
        around embedded media — a slider shortcode inside a 72ch column is a
        carousel in a letterbox.
 
        The value is allowlisted on write, so this cannot receive a template
        that does not exist; an old row with something else still falls back to
        the narrow measure rather than rendering full-bleed by accident.
      */}
      <Container className="section-y" data-aos="fade-up">
        <div className={page.template === "wide" ? "" : "max-w-[72ch]"}>
          {page.body ? <ProseWithShortcodes html={page.body} /> : null}

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
