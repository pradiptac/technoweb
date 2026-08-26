import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { ArticleMeta } from "@/components/ui/article-meta";
import { IconBook, IconTicket } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { KbSearchForm } from "./search-form";
import type { KnowledgeArticle, Paginated } from "@/types/api";

export const metadata = buildMetadata({
  title: "Knowledge base",
  description:
    "Configuration guides and troubleshooting steps from the Technoware support desk — the same material our engineers use.",
  path: "/knowledge-base",
});

export default async function KnowledgeBaseIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const sp = await searchParams;

  const query = new URLSearchParams();
  if (sp.q) query.set("q", sp.q);
  if (sp.category) query.set("category", sp.category);
  if (sp.page) query.set("page", sp.page);
  const qs = query.toString();

  let articles: Paginated<KnowledgeArticle> | null = null;
  let failed = false;

  try {
    // A search term makes this a one-off query — do not cache it.
    articles = await publicApi.knowledgeArticles(qs ? `?${qs}` : "", !sp.q);
  } catch {
    failed = true;
  }

  const searching = Boolean(sp.q);

  return (
    <>
      <PageHero
        kicker="Knowledge base"
        title="Answers, before you raise a ticket."
        lede="Configuration steps, common faults and the fixes our engineers apply. If the answer is here, you get it in thirty seconds instead of four hours."
        crumbs={[{ name: "Knowledge base", path: "/knowledge-base" }]}
      >
        <Suspense fallback={null}>
          <KbSearchForm />
        </Suspense>
      </PageHero>

      <Container data-aos="fade-up" className="section-y">
        {failed ? (
          <ErrorState title="We could not load the knowledge base">
            Refresh in a moment — or raise a ticket and we will answer directly.
          </ErrorState>
        ) : !articles || articles.data.length === 0 ? (
          <EmptyState
            icon={<IconBook />}
            title={searching ? `Nothing found for “${sp.q}”` : "Nothing published yet"}
            action={
              <Link
                href="/portal/tickets/new"
                className="inline-flex items-center gap-2 rounded bg-brand-600 px-4 py-[11px] text-[13.5px] font-semibold text-white hover:bg-brand-700"
              >
                <IconTicket className="size-4" /> Raise a ticket instead
              </Link>
            }
          >
            {searching
              ? "Try fewer words, or the name of the device or application involved."
              : "Articles are being written from the support desk's most common questions."}
          </EmptyState>
        ) : (
          <>
            <h2 className="display-3 mb-6">
              {searching ? `${articles.meta.total} result${articles.meta.total === 1 ? "" : "s"} for “${sp.q}”` : "All articles"}
            </h2>

            <ul className="grid gap-3">
              {articles.data.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/knowledge-base/${a.slug}`}
                    className="block rounded-lg border border-line-strong bg-card p-5 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
                  >
                    <h3 className="text-[16.5px]">{a.title}</h3>
                    {a.excerpt && (
                      <p className="mt-1.5 text-[14px] leading-[1.55] text-muted">{a.excerpt}</p>
                    )}
                    <ArticleMeta className="mt-2.5" category={a.category?.name} date={a.published_at} />
                  </Link>
                </li>
              ))}
            </ul>

            {searching && (
              <div className="mt-10 rounded-xl border border-line-strong bg-surface p-6">
                <h2 className="text-[16px]">Still stuck?</h2>
                <p className="mt-1.5 mb-4 text-[14px] text-muted">
                  If none of these match, raise a ticket and include what you have already tried —
                  it saves a round of questions.
                </p>
                <Link
                  href={`/portal/tickets/new?subject=${encodeURIComponent(sp.q ?? "")}`}
                  className="inline-flex items-center gap-2 rounded bg-brand-600 px-4 py-[11px] text-[13.5px] font-semibold text-white hover:bg-brand-700"
                >
                  <IconTicket className="size-4" /> Raise a ticket
                </Link>
              </div>
            )}
          </>
        )}
      </Container>
    </>
  );
}
