"use client";

import { useActionState, useEffect, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { copyMediaAction, deleteManyMediaAction, moveMediaAction, type BulkState } from "./actions";
import { Dialog } from "./item-menu";
import type { MediaFolder, MediaItem } from "@/types/api";

const initial: BulkState = {};

/**
 * What appears once anything is ticked.
 *
 * A bar that replaces the filter row rather than a second row added beneath
 * it: the two are never both useful, and the console's density is the point of
 * the console. It is `sticky` at the top of the grid so the actions stay
 * reachable while selecting down a long page — the alternative is scrolling
 * back up to press Delete, having lost sight of what is ticked.
 *
 * Nothing here is destructive without a dialog. Delete is the one action that
 * cannot be undone and the one whose blast radius scales with the selection,
 * so it asks — and says how many, because "delete 40 files" and "delete 1" are
 * different decisions wearing the same button.
 */
export function SelectionBar({
  selected, folders, onClear, onSelectAll, allSelected,
}: {
  selected: MediaItem[];
  folders: MediaFolder[];
  onClear: () => void;
  onSelectAll: () => void;
  allSelected: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  const [moveState, moveAction, moving] = useActionState(moveMediaAction, initial);
  const [copyState, copyAction, copying] = useActionState(copyMediaAction, initial);
  const [deleteState, deleteAction, deleting] = useActionState(deleteManyMediaAction, initial);

  const busy = moving || copying || deleting;
  const state = deleteState.ok || deleteState.error ? deleteState
    : copyState.ok || copyState.error ? copyState
      : moveState;

  /*
    A finished action clears the selection.

    The rows it referred to are gone, moved or duplicated — so the ticks now
    describe a state that no longer exists, and leaving them would let the next
    press act on ids the server has already dealt with. This is the one thing
    here that genuinely is a side effect: an outcome arriving from the server
    has to reach state the parent owns.
  */
  useEffect(() => {
    if (state.ok) onClear();
  }, [state.ok, onClear]);

  /*
    The confirmation closes because the delete succeeded — derived, not pushed.

    Setting it from the effect above works and is a cascading render for
    something already knowable at render time: the dialog is open when somebody
    asked for it *and* the action has not yet reported success.
  */
  const confirmOpen = confirming && !deleteState.ok;

  const count = selected.length;
  const noun = `${count} file${count === 1 ? "" : "s"}`;

  // Every form posts the same set, so the ids are rendered once as a fragment
  // each of them includes.
  const idFields = selected.map((m) => (
    <input key={m.id} type="hidden" name="ids" value={m.id} />
  ));

  return (
    <>
      <div className="sticky top-13 z-20 mb-3 rounded-lg border border-brand-600 bg-brand-50 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-brand-ink">{noun} selected</span>

          <button
            type="button"
            onClick={onSelectAll}
            className="rounded px-2 py-1 text-[12.5px] font-medium text-brand-ink underline-offset-2 hover:underline"
          >
            {allSelected ? "Select none" : "Select every file on this page"}
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/*
              Download is a plain link per file rather than a bulk endpoint.

              A real bulk download means building a zip server-side, which is a
              new archive path on a public disk for a convenience — and the
              browser blocks a burst of programmatic downloads anyway. One at a
              time, from the tile, is the honest option until somebody asks for
              the archive.
            */}
            <Form action={moveAction} state={moveState} className="flex items-center gap-1.5">
              {idFields}
              <label htmlFor="bulk-folder" className="text-[12.5px] font-medium text-muted">Move to</label>
              <Select id="bulk-folder" name="folder_id" className="w-auto py-1.5 text-[13px]" disabled={busy}>
                {/* "" is Unfiled, which is a destination rather than the
                    absence of one — see the action. */}
                <option value="">Unfiled</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
              <Button type="submit" size="sm" variant="ghost" disabled={busy}>
                {moving ? "Moving…" : "Move"}
              </Button>
            </Form>

            <Form action={copyAction} state={copyState}>
              {idFields}
              <Button type="submit" size="sm" variant="ghost" disabled={busy}>
                {copying ? "Copying…" : "Duplicate"}
              </Button>
            </Form>

            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>

            <button
              type="button"
              onClick={onClear}
              disabled={busy}
              className="rounded px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>

        {(state.error || state.ok) && (
          <p
            // A live region, mounted with the bar rather than appearing with
            // its message already inside it — a region that arrives populated
            // has not *changed*, so nothing is announced.
            role="status"
            className={`mt-1.5 text-[12.5px] ${state.error ? "text-err" : "text-brand-ink"}`}
          >
            {state.error ?? state.ok}
          </p>
        )}
      </div>

      {confirmOpen && (
        <Dialog title={`Delete ${noun}?`} onClose={() => setConfirming(false)}>
          <p className="mb-1 text-[14px]">This deletes the files themselves, not just the listing.</p>
          <p className="mb-5 text-[13px] text-muted">
            Nothing here tracks which records point at a file, so this cannot
            tell you what it will break. Anything still using them will show a
            broken image afterwards.
          </p>
          <Form action={deleteAction} state={deleteState} className="flex flex-wrap items-center gap-3">
            {idFields}
            <Button type="submit" variant="destructive" disabled={deleting}>
              {deleting ? "Deleting…" : `Delete ${noun}`}
            </Button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
          </Form>
        </Dialog>
      )}
    </>
  );
}
