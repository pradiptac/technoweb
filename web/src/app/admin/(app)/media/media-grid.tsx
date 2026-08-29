"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteMediaAction } from "./actions";
import { Dialog } from "./item-menu";
import { MediaCard, RenameDialog } from "./media-card";
import { MediaPreview } from "./media-preview";
import { SelectionBar } from "./selection-bar";
import type { MediaFolder, MediaItem } from "@/types/api";

/**
 * The grid, and the one delete confirmation it shares.
 *
 * One dialog for the whole grid rather than one per card: the confirmation is
 * the same every time, and forty mounted copies of it is forty times the
 * markup for a thing at most one of which is ever open.
 */
export function MediaGrid({
  items, returnTo, folders, trashed = false,
}: {
  items: MediaItem[];
  returnTo: string;
  /** Destinations for the selection's Move control. */
  folders: MediaFolder[];
  /**
   * Showing the bin. A binned file offers Restore and Delete permanently and
   * nothing else — cropping something that has been deleted is not a thing
   * anybody means to do, and the selection bar's Move and Duplicate would
   * quietly bring it back to life.
   */
  trashed?: boolean;
}) {
  const [confirming, setConfirming] = useState<MediaItem | null>(null);

  /*
    The preview lives here for the reason the delete confirmation does, and one
    more: prev/next is a fact about the *list*, and a card knows only itself.
    Holding the index rather than the item is what lets the arrows move — an
    item would have to be searched back into position on every step.
  */
  const [previewing, setPreviewing] = useState<number | null>(null);

  // Opened from the preview's own Edit button, which cannot reach the card's
  // copy of this dialog.
  const [editing, setEditing] = useState<MediaItem | null>(null);

  /*
    Selection is a Set of ids rather than an array of items.

    Two reasons. Membership is the question asked on every one of forty tiles
    on every render, and that is O(1) on a Set and O(n) on an array. And ids
    survive a re-render that hands back new item objects — holding the objects
    would make "is this one selected" an identity comparison against a row the
    server has since re-serialised.
  */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  // Derived from the current page, not stored: `items` changes under the
  // selection when a filter or a page changes, and a count kept in state
  // would then describe rows that are no longer on screen.
  const selected = items.filter((m) => selectedIds.has(m.id));
  const allSelected = items.length > 0 && selected.length === items.length;

  const selectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((m) => m.id)));
  }, [items]);

  return (
    <>
      {selected.length > 0 && !trashed && (
        <SelectionBar
          selected={selected}
          folders={folders}
          onClear={clear}
          onSelectAll={selectAll}
          allSelected={allSelected}
        />
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {items.map((m, i) => (
          <MediaCard
            key={m.id}
            item={m}
            returnTo={returnTo}
            onDelete={setConfirming}
            onPreview={() => setPreviewing(i)}
            selected={selectedIds.has(m.id)}
            onToggleSelect={() => toggle(m.id)}
            trashed={trashed}
          />
        ))}
      </ul>

      <MediaPreview
        items={items}
        index={previewing}
        onIndex={setPreviewing}
        onClose={() => setPreviewing(null)}
        onDelete={setConfirming}
        onEdit={(item) => { setPreviewing(null); setEditing(item); }}
      />

      {editing && <RenameDialog item={editing} onClose={() => setEditing(null)} />}

      {confirming && (
        <Dialog title={`Delete ${confirming.filename}?`} onClose={() => setConfirming(null)}>
          <p className="mb-1 text-[14px]">This deletes the file itself, not just the listing.</p>
          <p className="mb-5 text-[13px] text-muted">
            Nothing here tracks which records point at a file, so this cannot
            tell you what it will break. Anything still using{" "}
            <span className="font-mono text-[12.5px]">{confirming.path}</span>{" "}
            will show a broken image afterwards.
          </p>
          <form action={deleteMediaAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={confirming.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Button type="submit" variant="destructive">Delete file</Button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
