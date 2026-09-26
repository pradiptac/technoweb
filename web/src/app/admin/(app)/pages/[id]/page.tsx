import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getAnswerBlockKinds, getPage, getPageBuilderOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PageForm } from "../page-form";
import type { AdminPage, AnswerBlockKindOption, PageBuilderOptions } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit page", path: `/admin/pages/${id}`, seo: noIndex });
}

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

export default async function EditCmsPage({
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

  let page: AdminPage;
  let kinds: AnswerBlockKindOption[] = [];
  let builder: PageBuilderOptions;
  try {
    [page, kinds, builder] = await Promise.all([getPage(numericId), getAnswerBlockKinds("/admin/pages"), getPageBuilderOptions()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/pages", label: "All pages" }}
        title="Edit page"
      >
        <Badge tone={statusTone[page.status]}>{page.status_label}</Badge>
        {page.template === "builder" && (
          <Link href={`/admin/pages/${page.id}/preview`} className="ml-auto py-1 text-13-5 font-semibold text-brand-ink hover:underline">
            Preview
          </Link>
        )}
        {page.status === "published" && (
          <Link href={`/${page.slug}`} className={`${page.template === "builder" ? "" : "ml-auto "}py-1 text-13-5 font-semibold text-brand-ink hover:underline`}>
            View on site ↗
          </Link>
        )}
      </PageHeader>

      <PageForm page={page} saved={Boolean(saved)} kinds={kinds} builder={builder} />
    </>
  );
}
