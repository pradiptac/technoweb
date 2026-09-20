"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { deleteSliderAction } from "./actions";

/**
 * Deleting a slider, in one step or two.
 *
 * The homepage hero was deleted from the console in one press on 2026-09-17
 * — a ghost button at the foot of the edit form, straight to the action —
 * and its five slides came back out of MySQL's binary log. The client asked
 * for it to stay deletable behind a two-step confirmation rather than be
 * locked, so:
 *
 * - every slider now confirms in a dialog, the way a menu does;
 * - a **reserved** one (`reserved_for` is set — the homepage hero, the shop
 *   front) adds a second step inside it: an acknowledgement naming what the
 *   page falls back to, and the delete button stays disabled until it is
 *   ticked. That tick is posted as `confirm=1`, which is what the API demands
 *   before it will delete a reserved slider — so the second step is a request
 *   the API can tell apart, not a checkbox the screen could forget.
 *
 * A real `<form>` inside the dialog rather than a `startTransition` call,
 * because the action reads `id`, `slug` and `confirm` by name and a form is
 * the one place those travel together. The dialog is a `<dialog>` in the top
 * layer, so the form is not nested inside the slider form above it.
 */
export function DeleteSlider({
  id, slug, name, reservedFor, slideCount,
}: {
  id: number;
  slug: string;
  name: string;
  /** "the homepage hero" — null for a slider no page reads by name. */
  reservedFor: string | null;
  slideCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const ackId = useId();

  const close = () => { setOpen(false); setAcknowledged(false); };
  const ready = reservedFor === null || acknowledged;

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="text-err" onClick={() => setOpen(true)}>
        Delete slider
      </Button>

      <Modal open={open} onClose={close} title={`Delete “${name}”?`}>
        <form action={deleteSliderAction} onSubmit={() => setBusy(true)}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="slug" value={slug} />

          <p className="measure text-13 text-muted">
            The slider and its {slideCount} slide{slideCount === 1 ? "" : "s"} go. The pictures
            stay in the media library.
          </p>

          {reservedFor ? (
            <>
              <p className="measure mt-2 text-13 text-muted">
                <strong>This slider draws {reservedFor}.</strong> Without it the page shows
                its built-in fallback until a slider named{" "}
                <code className="font-mono text-12-5">{slug}</code> exists again — and the
                slides themselves cannot be brought back from the console.
              </p>
              <label className="mt-4 flex items-start gap-2.5 text-13" htmlFor={ackId}>
                <input
                  id={ackId}
                  type="checkbox"
                  name="confirm"
                  value="1"
                  className="mt-0.5"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>I understand {reservedFor} will lose its slider and want to delete it anyway.</span>
              </label>
            </>
          ) : (
            <p className="measure mt-2 text-13 text-muted">
              Anything embedding <code className="font-mono text-12-5">{`[slider slug="${slug}"]`}</code>{" "}
              will render nothing in its place.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button type="submit" variant="destructive" disabled={busy || !ready} pending={busy}>
              {reservedFor ? `Delete ${reservedFor}'s slider` : "Delete slider"}
            </Button>
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              Keep it
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
