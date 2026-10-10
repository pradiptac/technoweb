"use client";

import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import { announceRevisionLoad } from "@/lib/revisions";
import { previewRevisionAction, readRevisionAction } from "@/components/admin/revision-actions";
import type { RevisionMeta, RevisionRow, RevisionType } from "@/types/revisions";

/** What the record is called in the sentences in the dialog. */
const NOUN: Record<RevisionType, string> = {
  page: "page",
  saved_section: "library item",
  blog_post: "post",
  knowledge_article: "article",
  case_study: "case study",
  solution: "solution",
  service: "service",
  product: "product",
  store_product: "product",
  event: "event",
  job_opening: "vacancy",
  entry: "entry",
  landing_page: "landing page",
};

function sizeLabel(bytes: number | undefined): string {
  if (!bytes) return "";
  return bytes < 1024 ? `${bytes} B` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * "History" (0.145.0): the saved versions of a record, each one to look at or
 * to put back.
 *
 * **Restore loads, it does not save.** The version is read, then announced on
 * `document` for the form that holds the record to take (`FormDraft` for a
 * page or any other record, `LibraryEditor` for a library item). A kind the
 * API marks `restorable: false` is looked at and not put back: Restore is not
 * drawn and the dialog says why. Nothing is written until the
 * editor presses Save, and that save runs the current rules — a version
 * pointing at a slider since unpublished gets a normal 422 on the right
 * field instead of being written silently. Status and publish date are not in
 * a version and are never changed.
 *
 * **Refusals are shown inside the dialog.** It is a modal `<dialog>` in the top
 * layer, so a toast raised behind it would be neither seen nor reachable.
 */
export function RevisionDialog({
  type, id, pageId, initial, meta, className,
}: {
  type: RevisionType;
  id: number;
  pageId: number | null;
  initial: RevisionRow[];
  meta: RevisionMeta;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [looking, setLooking] = useState<{ row: RevisionRow; draft: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [, start] = useTransition();
  const noun = NOUN[type];
  const restorable = meta.restorable !== false;

  const close = useCallback(() => { setOpen(false); setLooking(null); setError(null); }, []);

  const preview = (row: RevisionRow) => {
    setError(null);
    setBusy(row.id);
    start(async () => {
      const result = await previewRevisionAction(row.id, pageId);
      setBusy(null);
      if (result.ok) setLooking({ row, draft: result.draft });
      else setError(result.error);
    });
  };

  const restore = (row: RevisionRow) => {
    setError(null);
    setBusy(row.id);
    start(async () => {
      const result = await readRevisionAction(row.id);
      setBusy(null);
      if (!result.ok) { setError(result.error); return; }
      announceRevisionLoad({
        type, id,
        at: result.revision.saved_at,
        fields: result.meta.fields,
        snapshot: result.revision.snapshot,
        media: result.revision.blocks_media ?? {},
      });
      close();
    });
  };

  const what = (row: RevisionRow) =>
    row.changed.map((key) => meta.labels[key] ?? key).join(", ") || "Nothing you can see";

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={className}
        onClick={() => setOpen(true)}
        title={`Look at an earlier saved version of this ${noun}, or put one back`}
      >
        History
      </Button>

      <Modal
        open={open}
        onClose={close}
        size={looking ? "xl" : "lg"}
        title={looking ? `Version from ${formatDate(looking.row.saved_at, "dateTime")}` : "History"}
        description={looking
          ? "Drawn by the public site’s own sections, under the active theme."
          : `The saved versions of this ${noun}, newest first. The latest ${meta.keep} are kept; saves by the same person within ${meta.coalesce_minutes} minutes count as one.`}
        footer={looking ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLooking(null)}>Back to the list</Button>
            {restorable && (
              <Button type="button" size="sm" pending={busy === looking.row.id} onClick={() => restore(looking.row)}>
                Restore this version
              </Button>
            )}
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={close}>Close</Button>
        )}
      >
        {error && <Alert tone="err" title="That did not work" dismissible={false}>{error}</Alert>}

        {looking ? (
          <iframe
            src={`/admin/draft-preview/${looking.draft}`}
            title={`Preview of the version saved ${formatDate(looking.row.saved_at, "dateTime")}`}
            className="block h-[65vh] w-full rounded border border-line bg-page"
          />
        ) : (
          <>
            <ul className="divide-y divide-line rounded border border-line">
              {initial.map((row, i) => (
                <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                  {/* A whole line on a phone, so the buttons wrap under it rather than squeezing the words into a column. */}
                  <div className="min-w-0 flex-1 basis-full sm:basis-0">
                    <p className="text-13-5 font-semibold text-ink">
                      {formatDate(row.saved_at, "dateTime")}
                      {i === 0 && <span className="ml-2 text-12-5 font-medium text-muted">Latest saved</span>}
                    </p>
                    <p className="text-12-5 text-muted [overflow-wrap:anywhere]">
                      {row.actor_name ?? "Not a person (an import or a command)"} · {what(row)}
                      {row.blocks_count > 0 && ` · ${row.blocks_count} ${row.blocks_count === 1 ? "section" : "sections"}`}
                      {row.size ? ` · ${sizeLabel(row.size)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" disabled={busy !== null} pending={busy === row.id} onClick={() => preview(row)}>
                      Preview
                    </Button>
                    {restorable && (
                      <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => restore(row)}>
                        Restore
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="measure mt-3 text-12-5 text-muted">
              {restorable
                ? "Restore puts the version into the form below — nothing is saved until you press Save. The status and publish date are never changed. "
                : "This kind of record’s form cannot take a version back, so a version can be looked at here and not restored. "}
              A section placed linked from the library shows the library’s content as it is now, and a version
              pointing at something since unpublished or deleted is refused by Save, naming the field. Only the
              name or title, address, written body and sections are kept in a version — not the SEO fields, FAQs, answer
              blocks, custom fields, relations or anything else on the other tabs.
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
