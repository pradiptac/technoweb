import { getPreviewLink } from "@/lib/admin";
import { PreviewLinkDialog } from "@/components/admin/preview-link-dialog";
import type { PreviewType } from "@/types/api";

/**
 * "Share preview" on an edit screen (0.138.0, `docs/admin-console.md` "Draft
 * share links"): reads the record's link and hands it to the dialog.
 *
 * A server component that sits in the `PageHeader` row — never inside the
 * record's `<Form>` (a form inside a form is invalid markup, and the dialog's
 * own `<form>` would be swallowed by it) and never as a child of `<Tabs>`,
 * which reads its children by position. Renders nothing when this account
 * cannot share the record, so a store manager editing a shop product is
 * offered it and a content manager looking at the same screen is not.
 */
export async function PreviewLinkPanel({ type, id, className }: { type: PreviewType; id: number; className?: string }) {
  const read = await getPreviewLink(type, id);
  if (!read) return null;

  return (
    <PreviewLinkDialog
      type={type}
      id={id}
      initial={read.data}
      days={read.meta.days}
      defaultDays={read.meta.default_days}
      className={className}
    />
  );
}
