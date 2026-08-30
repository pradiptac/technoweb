"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { browseMediaAction, uploadEditorImageAction, type MediaBrowse } from "@/app/admin/(app)/media-actions";
import { FileDrop } from "@/components/ui/file-drop";
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
  open, onClose, onPick, kind = "image", title, accept,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Which half of the library to show. Images by default, because that is what
   * almost every caller wants; `"file"` is the documents tab, which is where a
   * newsletter's PDF attachment comes from.
   */
  kind?: "image" | "file";
  title?: string;
  accept?: string;
  /**
   * Given the URL, the alt text, the **path**, and the file's own name and
   * size.
   *
   * Both addresses, because callers need different ones: an editor inserts the
   * `url`, and a field that saves a cover image stores the `path`. They are
   * not interchangeable — `url` carries `?v=<updated_at>` so an edited image
   * is not served from cache, and a stored path with a query string on it is a
   * filename that does not exist.
   *
   * `name` and `bytes` are there for a document: an attachment delivered under
   * its stored name arrives as `a8f3c1….pdf` in somebody's downloads folder,
   * and the size is what the deliverability check weighs.
   */
  onPick: (file: { url: string; alt: string; path: string; name: string; bytes: number }) => void;
}) {
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MediaBrowse | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  /*
    Uploading from inside the picker.

    Without it, "the image I want is not in the library yet" means leaving this
    dialog, losing whatever was being written, going to the media library,
    uploading, coming back and searching for it. That round trip is why people
    paste `data:` URIs into editors — the behaviour the library exists to stop.

    **One file is picked immediately; several are not.** Uploading a single
    image while choosing an image is unambiguous — it is the one you want, and
    an extra click to select the thing you just added is a click that only
    exists because the dialog was not paying attention. Uploading five is a
    different intent: they go into the library, the grid refreshes with them at
    the front, and nothing is chosen until somebody says which.

    Sequential, like every other upload here: a server action per file, and
    firing them together makes a failure impossible to attribute.
  */
  const upload = async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    const uploaded: { url: string; alt: string; path: string; name: string; bytes: number }[] = [];
    const failed: string[] = [];

    try {
      for (const file of files) {
        const data = new FormData();
        data.append("file", file);

        const result = await uploadEditorImageAction(data);

        // `EditorUpload` is a union of a success and a failure, so it is
        // narrowed rather than read optimistically.
        if ("error" in result) failed.push(`${file.name} — ${result.error}`);
        else uploaded.push({ url: result.url, alt: result.alt, path: result.path, name: result.name, bytes: result.bytes });
      }
    } finally {
      // try/finally, because a thrown action would otherwise leave the picker
      // reporting "Uploading…" for ever — the trap the media uploader
      // documents for `redirect()`.
      setUploading(false);
    }

    if (failed.length) setUploadError(failed.join(" · "));

    if (uploaded.length === 1 && failed.length === 0) {
      onPick(uploaded[0]);
      onClose();

      return;
    }

    // Back to the front of the grid, where the newest files are.
    setPage(1);
    setReload((n) => n + 1);
  };

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
        setResult(await browseMediaAction({ q: q || undefined, folder: folder || undefined, page, kind }));
      });
    }, q ? 250 : 0);

    return () => clearTimeout(timer);
  }, [open, q, folder, page, reload, kind]);

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
      title={title ?? "Insert from the media library"}
      description={kind === "file"
        ? "Choose a document. It is attached under the name shown here."
        : "Choose an image to place at the cursor. Alt text comes with the file."}
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

      {/*
        The uploader sits above the grid rather than in a second dialog: the
        question being answered is "which image", and "one I have not uploaded
        yet" is a legitimate answer to it.
      */}
      <div className="mb-4">
        <FileDrop
          multiple
          accept={accept ?? ".png,.jpg,.jpeg,.gif,.webp,.svg"}
          onFiles={(files) => { void upload(Array.from(files)); }}
          label={uploading ? "Uploading…" : kind === "file" ? "Upload a document…" : "Upload an image…"}
          hint="It goes into the library, so it can be found and reused later."
          disabled={uploading}
        />

        {uploadError && (
          <p role="alert" className="mt-1.5 text-[12.5px] text-err">{uploadError}</p>
        )}
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
            : "The library has no images yet. Upload one above and it will appear here."}
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
              <MediaTile item={item} onPick={() => { onPick({ url: item.url, alt: item.alt_text ?? "", path: item.path, name: item.filename, bytes: item.size }); onClose(); }} />
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
