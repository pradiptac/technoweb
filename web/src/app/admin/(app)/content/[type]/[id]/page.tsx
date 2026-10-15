import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewLinkPanel } from "@/components/admin/preview-link-panel";
import { RevisionPanel } from "@/components/admin/revision-panel";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getEntries, getEntry, getPageBuilderOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { EntryForm } from "../entry-form";
import { requireScreen } from "@/lib/admin-screen";

export async function generateMetadata({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  return buildMetadata({ title: "Edit entry", path: `/admin/content/${type}/${id}`, seo: noIndex });
}

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

export default async function EditEntryPage({
  params, searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireScreen();
  const { type: slug, id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let entry: Awaited<ReturnType<typeof getEntry>>;
  let meta: Awaited<ReturnType<typeof getEntries>>["meta"];
  try {
    [entry, meta] = await Promise.all([getEntry(slug, numericId), getEntries(slug, { per_page: 1 }).then((r) => r.meta)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: `/admin/content/${slug}`, label: `All ${meta.type.plural.toLowerCase()}` }}
        title={`Edit ${meta.type.name.toLowerCase()}`}>
        <Badge tone={statusTone[entry.status]}>{entry.status_label}</Badge>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <RevisionPanel type="entry" id={entry.id} />
          <PreviewLinkPanel type="entry" id={entry.id} />
        </span>
        {entry.status === "published" && meta.type.is_active && (
          <Link href={entry.path} className="py-1 text-13-5 font-semibold text-brand-ink hover:underline">
            View on site ↗
          </Link>
        )}
      </PageHeader>

      <EntryForm type={meta.type} entry={entry} kinds={meta.answer_block_kinds} saved={Boolean(saved)} builder={await getPageBuilderOptions()} />
    </>
  );
}
