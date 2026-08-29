"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { browseMediaAction, type MediaBrowse } from "@/app/admin/(app)/media-actions";
import type { MediaItem } from "@/types/api";
import { cn } from "@/lib/utils";

/**
 * Pick an image that is already in the media library.
 *
 * The other half of "images live in the library". Uploading from the editor
 * puts a file there; without this, reusing one means uploading it again — and
 * a library holding four copies of the same logo under four hashed names is
 * one nobody can find anything in.
 *
 * Search covers alt text as well as the filename, because the stored name is a
 * hash and the human one is usually `img_4821`: the alt text is the only field
 * that says what the picture shows, which is what somebody hunting for a
 * photograph actually types. That is the API's behaviour, not this
 * component's — see API.md.
 */
export function MediaBrowser({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  /** Given the URL and the alt text stored against the file. */
  onPick: (image: { url: string; alt: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MediaBrowse | null>(null);
  const [pending, startTransition] = useTransition();

  /*
    Fetched when the dialog opens and on every change of the three inputs,
    debounced so typing a filename is one request rather than one per letter.

    The library is not loaded until it is asked for: this component is mounted
    by every body editor on every CMS form, and eagerly listing 24 images on
    each of eleven forms would be a request nobody made on every edit screen in
    the console.
  */
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      startTransition(async () => {
        setResult(await browseMediaAction({ q: q || undefined, folder: folder || undefined, page }));
      });
    }, q ? 250 : 0);

    return () => clearTimeout(timer);
  }, [open, q, folder, page]);

  /*
    A new search starts at page one — otherwise a search made from page three
    asks for the third page of a result set that has two, and the grid comes
    back empty for a term that matches plenty.

    Done in the handlers rather than in an effect on [q, folder]. The effect
    version reads as the same thing and is not: it renders once with the new
    query and the *old* page, fires a request for that pair, then renders again
    — a wasted round trip on every keystroke, and `react-hooks/set-state-in-effect`
    exists to catch exactly this shape.
  */
  const search = (value: string) => { setQ(value); setPage(1); };
  const filter = (value: string) => { setFolder(value); setPage(1); };

  const items = result?.items ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Insert from the media library"
      description="Choose an image to place at the cursor. Alt text comes with the file."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => search(e.currentTarget.value)}
          placeholder="Search filename or alt text"
          aria-label="Search the media library"
          className="min-w-[12rem] flex-1"
        />
        <Select
          value={folder}
          onChange={(e) => filter(e.currentTarget.value)}
          aria-label="Folder"
          className="w-auto"
        >
          <option value="">All folders</option>
          {/* A real value, not an absent one — see API.md. */}
          <option value="unfiled">Unfiled</option>
          {(result?.folders ?? []).map((f) => (
            <option key={f.id} value={String(f.id)}>{f.name} ({f.media_count})</option>
          ))}
        </Select>
      </div>

      {items.length === 0 && !pending ? (
        /*
          Not `EmptyState`, which carries its own <h2>. This sits inside a
          dialog that already has a heading, and a second one here would put a
          heading inside a heading's own section for one line of prose.
        */
        <p className="rounded border border-dashed border-line-strong bg-surface px-5 py-9 text-center text-[13.5px] text-muted">
          {q || folder
            ? "Nothing matches that. Try a different search, or clear the folder filter."
            : "The library has no images yet. Upload one with the picture button and it will appear here."}
        </p>
      ) : (
        <ul
          className={cn(
            "grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4",
            // Dimmed rather than replaced while a new page loads: swapping the
            // grid for a spinner makes every keystroke a flash of empty box.
            pending && "opacity-55 transition-opacity",
          )}
        >
          {items.map((item) => (
            <li key={item.id}>
              <MediaTile item={item} onPick={() => { onPick({ url: item.url, alt: item.alt_text ?? "" }); onClose(); }} />
            </li>
          ))}
        </ul>
      )}

      {(result?.lastPage ?? 1) > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-[12.5px]">
          <span className="text-muted">
            Page {page} of {result?.lastPage} · {result?.total} images
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-line-strong bg-card px-2.5 py-1.5 font-semibold disabled:opacity-45"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= (result?.lastPage ?? 1)}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-line-strong bg-card px-2.5 py-1.5 font-semibold disabled:opacity-45"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function MediaTile({ item, onPick }: { item: MediaItem; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={item.alt_text || item.filename}
      className={cn(
        "group block w-full overflow-hidden rounded border border-line-strong bg-surface text-left",
        "transition-colors hover:border-brand-600",
      )}
    >
      {/*
        A plain <img>, not next/image. The source is a runtime URL on the API's
        own origin, there is no layout to reserve in a 24-tile grid of thumbnails
        that are all the same box, and the optimiser would be resizing images
        that exist only for the length of this dialog.

        alt="" because the filename underneath is the accessible name of the
        button: announcing both reads the same string twice.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt="" loading="lazy" className="block h-24 w-full bg-card object-contain p-1.5" />
      <span className="block truncate border-t border-line px-2 py-1.5 text-[11.5px] text-muted group-hover:text-ink">
        {item.alt_text || item.filename}
      </span>
    </button>
  );
}
