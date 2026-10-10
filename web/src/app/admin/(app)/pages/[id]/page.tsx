import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewLinkPanel } from "@/components/admin/preview-link-panel";
import { RevisionPanel } from "@/components/admin/revision-panel";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/input";
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
  searchParams: Promise<{ saved?: string; dropped?: string }>;
}) {
  await requireScreen();
  const { id } = await params;
  const { saved, dropped: droppedParam } = await searchParams;
  /*
    How many sections the AI page builder proposed and the page's rules
    refused (`?dropped=N`, written by the draft action). Read as a number and
    nothing else — the sentence is ours, never text from the URL — and capped,
    so a hand-edited link cannot make the line claim thousands.
  */
  const droppedCount = /^\d{1,2}$/.test(droppedParam ?? "") ? Number(droppedParam) : 0;

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
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <RevisionPanel type="page" id={page.id} pageId={page.id} />
          <PreviewLinkPanel type="page" id={page.id} />
        </span>
        {page.template === "builder" && (
          <Link href={`/admin/pages/${page.id}/preview`} className="py-1 text-13-5 font-semibold text-brand-ink hover:underline">
            Preview
          </Link>
        )}
        {page.status === "published" && (
          <Link href={`/${page.slug}`} className="py-1 text-13-5 font-semibold text-brand-ink hover:underline">
            View on site ↗
          </Link>
        )}
      </PageHeader>

      {droppedCount > 0 && (
        <Alert tone="info" title="Some suggested sections were left out">
          {droppedCount === 1
            ? "1 section the assistant suggested did not pass the page's rules and was left out."
            : `${droppedCount} sections the assistant suggested did not pass the page's rules and were left out.`}
        </Alert>
      )}

      <PageForm page={page} saved={Boolean(saved)} kinds={kinds} builder={builder} />
    </>
  );
}
