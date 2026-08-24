import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getKnowledgeCategories } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ArticleForm } from "../article-form";
import type { KnowledgeCategory } from "@/types/api";

export const metadata = buildMetadata({ title: "New article", path: "/admin/knowledge-base/new", seo: noIndex });

export default async function NewKnowledgeArticlePage() {
  let categories: KnowledgeCategory[] = [];
  try {
    categories = await getKnowledgeCategories();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/knowledge-base", label: "All articles" }}
        title="New article"
      />

      <ArticleForm categories={categories} />
    </>
  );
}
