import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getAnswerBlockKinds, getKnowledgeCategories, getCustomFieldGroups } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ArticleForm } from "../article-form";
import type { KnowledgeCategory, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New article", path: "/admin/knowledge-base/new", seo: noIndex });

export default async function NewKnowledgeArticlePage() {
  await requireScreen();
  let categories: KnowledgeCategory[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  try {
    [categories, kinds] = await Promise.all([getKnowledgeCategories(), getAnswerBlockKinds("/admin/knowledge-articles")]);
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

      <ArticleForm categories={categories} kinds={kinds} fieldGroups={await getCustomFieldGroups("/admin/knowledge-articles")} />
    </>
  );
}
