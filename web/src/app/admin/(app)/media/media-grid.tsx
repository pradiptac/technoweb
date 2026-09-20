"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { deleteMediaAction } from "./actions";
import { Dialog } from "./item-menu";
import { cn } from "@/lib/utils";
import { MediaCard } from "./media-card";
import { RenameDialog } from "./media-dialogs";
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
  items, returnTo, folders, trashed = false, columns,
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
  /** Column classes for the chosen tile size. See TILE_SIZES on the page. */
  columns?: string;
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

  /*
    The keyboard. The grid is the one console screen worked with pictures
    rather than words, and it rewards the keyboard most: arrows move between
    tiles (up and down by the rendered column count, read off the grid's own
    `grid-template-columns` so it is right at every tile size), Space opens
    the preview, Enter the details, Delete asks before binning, and `x`
    ticks the tile. One tab stop for the whole grid — a roving `tabIndex`
    on the active tile — so Tab does not stop forty times on the way to the
    pager. The keys are read on the `<ul>` and only when the tile itself is
    focused: a key typed in the tile's checkbox, menu or a dialog is left to
    that control.
  */
  const list = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  const focusTile = (i: number) => {
    const tile = list.current?.children[i] as HTMLElement | undefined;
    if (!tile) return;
    setActive(i);
    tile.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const ul = list.current;
    const tile = e.target as HTMLElement;
    if (!ul || tile.tagName !== "LI" || tile.parentElement !== ul) return;
    const i = Array.prototype.indexOf.call(ul.children, tile);
    const item = items[i];
    if (!item) return;
    const cols = getComputedStyle(ul).gridTemplateColumns.split(" ").length;
    const last = items.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: Math.min(i + 1, last), ArrowLeft: Math.max(i - 1, 0),
      ArrowDown: Math.min(i + cols, last), ArrowUp: Math.max(i - cols, 0),
      Home: 0, End: last,
    };
    if (e.key in moves) { e.preventDefault(); focusTile(moves[e.key]); return; }
    if (e.key === " ") { e.preventDefault(); setPreviewing(i); }
    else if (e.key === "Enter") { e.preventDefault(); if (!trashed) setEditing(item); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); if (!trashed) setConfirming(item); }
    else if (e.key.toLowerCase() === "x") { e.preventDefault(); toggle(item.id); }
  };

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

      <ul
        ref={list}
        onKeyDown={onKeyDown}
        aria-label="Files"
        className={cn("grid gap-3", columns ?? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5")}
      >
        {items.map((m, i) => (
          <MediaCard
            key={m.id}
            item={m}
            tabIndex={i === Math.min(active, items.length - 1) ? 0 : -1}
            onFocusTile={() => setActive(i)}
            returnTo={returnTo}
            onDelete={setConfirming}
            onPreview={() => setPreviewing(i)}
            selected={selectedIds.has(m.id)}
            onToggleSelect={() => toggle(m.id)}
            trashed={trashed}
            /* The first row, not just the first tile: the grid runs to five
               columns at 2xl and any of them can win the LCP. */
            priority={i < 5}
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
          <p className="mb-1 text-14">This deletes the file itself, not just the listing.</p>
          <p className="mb-5 text-13 text-muted">
            Nothing here tracks which records point at a file, so this cannot
            tell you what it will break. Anything still using{" "}
            <span className="font-mono text-12-5">{confirming.path}</span>{" "}
            will show a broken image afterwards.
          </p>
          <form action={deleteMediaAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={confirming.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Button type="submit" variant="destructive">Delete file</Button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="cursor-pointer rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
