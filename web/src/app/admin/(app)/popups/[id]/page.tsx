import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getPopup, type PopupMeta } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PopupForm } from "../popup-form";
import { deletePopupAction } from "../actions";
import type { AdminPopup } from "@/types/api";

export const metadata = buildMetadata({ title: "Edit popup", path: "/admin/popups", seo: noIndex });

export default async function EditPopupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let popup: AdminPopup;
  let meta: PopupMeta;
  try {
    const res = await getPopup(Number(id));
    popup = res.data;
    meta = res.meta;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/popups", label: "All popups" }} title="Edit popup">
        <Badge tone={popup.status === "published" ? "resolved" : "progress"}>{popup.status}</Badge>
      </PageHeader>

      {/* No `saved` prop and no inline alert: this screen is reached from a
          redirect carrying `?done=saved`, and `ToastFromParams` in the admin
          layout announces it. An inline panel for the same thing would push
          the record down the page and stay there until the next navigation. */}
      <PopupForm popup={popup} meta={meta} />

      {/* Outside the form: a delete button inside another form's markup is a
          nested form, which is invalid and which browsers resolve by dropping
          one of them. */}
      <form action={deletePopupAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={popup.id} />
        <p className="mb-2 text-[13px] text-muted">
          Deleting this stops it appearing anywhere. The picture stays in the media library —
          it is very often artwork a page uses too, and nothing here tracks what points at a file.
        </p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete popup</Button>
      </form>
    </>
  );
}
