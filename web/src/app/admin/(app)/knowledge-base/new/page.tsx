import Link from "next/link";
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
      <Link href="/admin/knowledge-base" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All articles
      </Link>
      <h1 className="admin-title mt-4 mb-6">New article</h1>

      <ArticleForm categories={categories} />
    </>
  );
}
