import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { ArticleMeta } from "@/components/ui/article-meta";
import { IconTicket } from "@/components/icons";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { KnowledgeArticle } from "@/types/api";

async function load(slug: string): Promise<KnowledgeArticle | null> {
  try {
    return (await publicApi.knowledgeArticle(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await load(slug);

  if (!article) return buildMetadata({ title: "Not found", path: `/knowledge-base/${slug}`, seo: noIndex });

  return buildMetadata({
    title: article.title,
    description: article.excerpt,
    path: `/knowledge-base/${article.slug}`,
    type: "article",
    seo: article.seo,
  });
}

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await load(slug);

  if (!article) notFound();

  const tags = article.tags ?? [];

  return (
    <>
      <article>
        <Container className="max-w-[780px] pt-11 pb-8 lg:pt-14">
          <Breadcrumbs
            crumbs={[
              { name: "Knowledge base", path: "/knowledge-base" },
              ...(article.category
                ? [{ name: article.category.name, path: `/knowledge-base?category=${article.category.slug}` }]
                : []),
              { name: article.title, path: `/knowledge-base/${article.slug}` },
            ]}
          />
          <h1 className="display-2 mt-6">{article.title}</h1>
          {article.excerpt && <p className="lede mt-4">{article.excerpt}</p>}
          <ArticleMeta
            className="mt-5 border-t border-line pt-5"
            category={article.category?.name}
            date={article.published_at}
          />
        </Container>

        <Container data-aos="fade-up" className="max-w-[780px] pb-16">
          {article.body && <ProseWithShortcodes html={article.body} className="max-w-none" />}

          {tags.length > 0 && (
            <ul className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
              {tags.map((t) => (
                <li key={t}>
                  <Link
                    href={`/knowledge-base?q=${encodeURIComponent(t)}`}
                    className="block rounded-full border border-line-strong px-3 py-1.5 text-[12.5px] text-muted hover:border-brand-300 hover:bg-brand-50"
                  >
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 rounded-xl border border-line-strong bg-surface p-6">
            <h2 className="text-[16px]">Did this not solve it?</h2>
            <p className="mt-1.5 mb-4 text-[14px] text-muted">
              Raise a ticket and mention this article — the engineer will know what you have
              already ruled out.
            </p>
            <Link
              href={`/portal/tickets/new?subject=${encodeURIComponent(article.title)}`}
              className="inline-flex items-center gap-2 rounded bg-brand-600 px-4 py-[11px] text-[13.5px] font-semibold text-white hover:bg-brand-700"
            >
              <IconTicket className="size-4" /> Raise a ticket
            </Link>
          </div>
        </Container>
      </article>

      {/*
        Built by the API, rendered here.
        See App\Support\StructuredData — the graph used to be assembled in this
        file, which is how the blog and the case study both ended up declaring
        `dateModified: published_at` and naming the Organization as author while
        the record carried an author_id. Escaping stays in `JsonLd`, because
        JSON.stringify does not escape `<` and a CMS field containing
        `</script>` would otherwise close the block.
      */}
      {article.schema && <JsonLd data={article.schema} />}
    </>
  );
}
