import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { ApiError } from "@/lib/api";
import { getEntries, getPageBuilderOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { EntryForm } from "../entry-form";
import { requireScreen } from "@/lib/admin-screen";

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return buildMetadata({ title: "New entry", path: `/admin/content/${type}/new`, seo: noIndex });
}

export default async function NewEntryPage({ params }: { params: Promise<{ type: string }> }) {
  await requireScreen();
  const { type: slug } = await params;

  // The type, its answer-block kinds and its field groups, from its own
  // entries index — one read for everything the new form needs.
  let meta: Awaited<ReturnType<typeof getEntries>>["meta"];
  try {
    meta = (await getEntries(slug, { per_page: 1 })).meta;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: `/admin/content/${slug}`, label: `All ${meta.type.plural.toLowerCase()}` }}
        title={`New ${meta.type.name.toLowerCase()}`} />
      <EntryForm type={meta.type} kinds={meta.answer_block_kinds} fieldGroups={meta.custom_field_groups} builder={await getPageBuilderOptions()} />
    </>
  );
}
