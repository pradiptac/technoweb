import Link from "next/link";
import { HelpfulVote } from "@/components/knowledge/helpful-vote";
import { ArticleMap, ReadingProgress } from "@/components/ui/article-map";
import { withHeadingIds } from "@/lib/headings";
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
  const { html: body, headings } = withHeadingIds(article.body ?? "");

  return (
    <>
      <article id="article-body">
        <ReadingProgress target="article-body" />
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
          {/* One column here, so the map sits above the body rather than beside it. */}
          <ArticleMap headings={headings} className="mb-8 rounded-xl border border-line bg-surface p-4" />
          {body && <ProseWithShortcodes html={body} className="max-w-none" />}

          <HelpfulVote slug={article.slug} title={article.title} />

          {tags.length > 0 && (
            <ul className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
              {tags.map((t) => (
                <li key={t}>
                  <Link
                    href={`/knowledge-base?q=${encodeURIComponent(t)}`}
                    className="block rounded-full border border-line-strong px-3 py-1.5 text-12-5 text-muted hover:border-brand-300 hover:bg-brand-50"
                  >
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 rounded-xl border border-line-strong bg-surface p-6">
            <h2 className="text-[16px]">Did this not solve it?</h2>
            <p className="mt-1.5 mb-4 text-14 text-muted">
              Raise a ticket and mention this article — the engineer will know what you have
              already ruled out.
            </p>
            <Link
              href={`/portal/tickets/new?subject=${encodeURIComponent(article.title)}`}
              className="inline-flex items-center gap-2 rounded bg-brand-600 px-4 py-[11px] text-13-5 font-semibold text-brand-on hover:bg-brand-700"
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
