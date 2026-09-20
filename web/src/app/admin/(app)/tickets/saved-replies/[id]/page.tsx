import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getCannedReplies, getCannedReply } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SavedReplyForm } from "../saved-reply-form";
import { deleteSavedReplyAction } from "../actions";
import type { CannedReply, CannedReplyPlaceholder } from "@/types/api";

export const metadata = buildMetadata({ title: "Edit saved reply", path: "/admin/tickets/saved-replies", seo: noIndex });

export default async function EditSavedReplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  let record: CannedReply;
  let placeholders: CannedReplyPlaceholder[];
  try {
    [record, placeholders] = await Promise.all([
      getCannedReply(numericId),
      getCannedReplies({ per_page: 1 }).then((r) => r.meta.placeholders),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/tickets/saved-replies", label: "All saved replies" }} title="Edit saved reply" />

      <SavedReplyForm record={record} placeholders={placeholders} />

      <form action={deleteSavedReplyAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={record.id} />
        <p className="mb-2 text-13 text-muted">
          Deleting this takes it off every ticket&rsquo;s picker. Replies already sent with it are unchanged.
        </p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete saved reply</Button>
      </form>
    </>
  );
}
