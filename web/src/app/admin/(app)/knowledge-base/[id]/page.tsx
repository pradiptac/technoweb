import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getKnowledgeArticle, getKnowledgeCategories } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ArticleForm } from "../article-form";
import type { AdminKnowledgeArticle, KnowledgeCategory } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit article", path: `/admin/knowledge-base/${id}`, seo: noIndex });
}

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

export default async function EditKnowledgeArticlePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let article: AdminKnowledgeArticle;
  let categories: KnowledgeCategory[] = [];
  try {
    [article, categories] = await Promise.all([getKnowledgeArticle(numericId), getKnowledgeCategories()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <Link href="/admin/knowledge-base" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All articles
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">Edit article</h2>
        <Badge tone={statusTone[article.status]}>{article.status_label}</Badge>
        {article.status === "published" && (
          <Link
            href={`/knowledge-base/${article.slug}`}
            className="ml-auto py-1 text-[13.5px] font-semibold text-brand-600 hover:underline"
          >
            View on site ↗
          </Link>
        )}
      </div>

      <ArticleForm article={article} categories={categories} saved={Boolean(saved)} />
    </>
  );
}
