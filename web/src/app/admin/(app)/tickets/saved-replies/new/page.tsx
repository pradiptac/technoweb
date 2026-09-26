import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getCannedReplies } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SavedReplyForm } from "../saved-reply-form";
import type { CannedReplyPlaceholder } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New saved reply", path: "/admin/tickets/saved-replies/new", seo: noIndex });

export default async function NewSavedReplyPage() {
  await requireScreen();
  // The chips come from the index's `meta.placeholders` — one list, the API's.
  let placeholders: CannedReplyPlaceholder[];
  try {
    placeholders = (await getCannedReplies({ per_page: 1 })).meta.placeholders;
  } catch {
    return (
      <ErrorState title="We could not load the saved replies">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/tickets/saved-replies", label: "All saved replies" }} title="New saved reply" />

      <SavedReplyForm placeholders={placeholders} />
    </>
  );
}
