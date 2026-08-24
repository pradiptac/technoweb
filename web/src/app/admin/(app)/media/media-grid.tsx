"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteMediaAction } from "./actions";
import { Dialog } from "./item-menu";
import { MediaCard } from "./media-card";
import type { MediaItem } from "@/types/api";

/**
 * The grid, and the one delete confirmation it shares.
 *
 * One dialog for the whole grid rather than one per card: the confirmation is
 * the same every time, and forty mounted copies of it is forty times the
 * markup for a thing at most one of which is ever open.
 */
export function MediaGrid({ items, returnTo }: { items: MediaItem[]; returnTo: string }) {
  const [confirming, setConfirming] = useState<MediaItem | null>(null);

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {items.map((m) => (
          <MediaCard key={m.id} item={m} returnTo={returnTo} onDelete={setConfirming} />
        ))}
      </ul>

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
