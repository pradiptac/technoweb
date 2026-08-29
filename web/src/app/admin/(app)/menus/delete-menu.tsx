"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { deleteMenuAction } from "./actions";

/**
 * Deleting a menu is not deleting anything it links to, and the dialog says so
 * — "Delete menu" reads like it might take the pages with it, the same
 * confusion the media library's folder dialog has to answer.
 */
export function DeleteMenu({ id, name }: { id: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete menu
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Delete “${name}”?`}>
        <p className="measure text-[13px] text-muted">
          The menu and its items go. <strong>Nothing they link to is touched</strong> — the
          pages, solutions and articles all stay exactly as they are.
        </p>
        <p className="measure mt-2 text-[13px] text-muted">
          If this menu is assigned to a location, that part of the site goes back to the
          navigation built into it.
        </p>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => { setBusy(true); void deleteMenuAction(id); }}
          >
            {busy ? "Deleting…" : "Delete menu"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            Keep it
          </Button>
        </div>
      </Modal>
    </>
  );
}
