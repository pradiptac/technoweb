import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getAnswerBlockKinds, getKnowledgeArticle, getKnowledgeCategories, getPageBuilderOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ArticleForm } from "../article-form";
import type { AdminKnowledgeArticle, KnowledgeCategory, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

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
  await requireScreen();
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let article: AdminKnowledgeArticle;
  let categories: KnowledgeCategory[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  try {
    [article, categories, kinds] = await Promise.all([getKnowledgeArticle(numericId), getKnowledgeCategories(), getAnswerBlockKinds("/admin/knowledge-articles")]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/knowledge-base", label: "All articles" }}
        title="Edit article"
      >
        <Badge tone={statusTone[article.status]}>{article.status_label}</Badge>
        {article.status === "published" && (
          <Link
            href={`/knowledge-base/${article.slug}`}
            className="ml-auto py-1 text-13-5 font-semibold text-brand-ink hover:underline"
          >
            View on site ↗
          </Link>
        )}
      </PageHeader>

      <ArticleForm article={article} categories={categories} saved={Boolean(saved)} kinds={kinds} builder={await getPageBuilderOptions()} />
    </>
  );
}
