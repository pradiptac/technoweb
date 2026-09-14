"use client";

import Image from "next/image";
import { Form } from "@/components/ui/form";
import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, KeepOriginalToggle, Textarea } from "@/components/ui/input";
import { renameMediaAction, resizeMediaAction, type RenameState, type ReplaceState, type ResizeState } from "./actions";
import { FileDrop, type UploadProgress } from "@/components/ui/file-drop";
import { refusalMessage, uploadWithProgress } from "@/lib/upload-client";
import { Dialog } from "./item-menu";
import { cn } from "@/lib/utils";
import { THUMBNAIL_SIZES, type MediaItem, type ThumbnailSize } from "@/types/api";
import { formatDate } from "@/lib/dates";
import { readableSize } from "./media-card";

/**
 * The dialogs a media card opens — rename, resize, replace — and the facts
 * panel the rename dialog carries. `media-card.tsx` is the tile and its menu;
 * it was 729 lines holding both.
 */

const THUMBNAIL_NAMES: Record<ThumbnailSize, string> = {
  90: "Small",
  120: "Medium",
  180: "Large",
};

const THUMBNAILS = THUMBNAIL_SIZES.map((size) => ({
  size,
  label: `${THUMBNAIL_NAMES[size]} (${size}×${size})`,
}));

/**
 * Exported because the preview opens it too.
 *
 * One editor for a file's details, wherever it is reached from — a second
 * implementation of the same fields is two sets of rules free to drift, which
 * is the argument that keeps `/admin/seo` read-mostly as well.
 */
export function RenameDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [state, action, pending] = useActionState<RenameState, FormData>(renameMediaAction, {});

  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  return (
    <Dialog title={`Edit ${item.filename}`} onClose={onClose}>
      <Form action={action} state={state}>
        <input type="hidden" name="id" value={item.id} />
        {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

        <Field
          label="File name"
          htmlFor={`rename-${item.id}`}
          hint="A label only. The stored file keeps its own name, so nothing already pointing at it breaks."
        >
          <Input id={`rename-${item.id}`} name="filename" defaultValue={item.filename} required />
        </Field>

        {/*
          Alt text was storable and unreachable: the column existed, the API
          accepted it, and no screen anywhere could set it. It travels with
          the file, so describing an image once covers every page that uses
          it.
        */}
        <Field
          label="Alt text"
          htmlFor={`alt-${item.id}`}
          hint="What the image shows, for screen readers and search engines. Leave it empty if the image is decorative — an empty alt is correct there, a sentence is not."
        >
          <Input
            id={`alt-${item.id}`}
            name="alt_text"
            defaultValue={item.alt_text ?? ""}
            maxLength={255}
            placeholder="Cisco Catalyst CBS350 24-port switch, front view"
          />
        </Field>

        {/*
          A working note, and explicitly not a second alt text.

          The hint says so because the two fields sit next to each other and
          the difference is invisible from the label alone: one is announced in
          place of the picture on every public page, the other is for whoever
          is filing assets and reaches no public response at all. Given one
          box, people write the caption in whichever they met first.
        */}
        <Field
          label="Description"
          htmlFor={`desc-${item.id}`}
          hint="A note for your colleagues — where it came from, what it may be used for. Never shown on the site."
        >
          <Textarea
            id={`desc-${item.id}`}
            name="description"
            rows={2}
            defaultValue={item.description ?? ""}
            maxLength={2000}
            placeholder="Shot at the Salt Lake install, March 2026. Client approved for web use."
          />
        </Field>

        {/*
          One comma-separated field rather than a chip editor.

          The chip version is what the screenshots show and it is more work
          than it is worth here: it needs its own keyboard handling for
          backspace-removes-the-last, its own focus management, and a hidden
          input to post through anyway. A text field is pasteable, editable
          with the caret keys everybody already has, and readable at a glance.
          The API normalises case and duplicates, so "Hero, hero " is one tag.
        */}
        <Field
          label="Tags"
          htmlFor={`tags-${item.id}`}
          hint="Separated by commas. Lower-cased and de-duplicated on save, and searchable from the box above the grid."
        >
          <Input
            id={`tags-${item.id}`}
            name="tags"
            defaultValue={item.tags.join(", ")}
            placeholder="hero, networking, 2026-brochure"
          />
        </Field>

        <MediaFacts item={item} />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" pending={pending}>{pending ? "Saving…" : "Save"}</Button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </Form>
    </Dialog>
  );
}

export function ResizeDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [state, action, pending] = useActionState<ResizeState, FormData>(resizeMediaAction, {});
  const [width, setWidth] = useState(item.width ?? 0);
  const [height, setHeight] = useState(item.height ?? 0);
  const [locked, setLocked] = useState(true);
  const lockId = useId();

  const ratio = item.width && item.height ? item.height / item.width : 1;

  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  const changeWidth = (value: number) => {
    setWidth(value);
    if (locked && value > 0) setHeight(Math.max(1, Math.round(value * ratio)));
  };
  const changeHeight = (value: number) => {
    setHeight(value);
    if (locked && value > 0) setWidth(Math.max(1, Math.round(value / ratio)));
  };

  return (
    <Dialog title={`Resize ${item.filename}`} onClose={onClose}>
      <Form action={action} state={state}>
        <input type="hidden" name="id" value={item.id} />
        {state.error && <Alert tone="err" title="Could not resize">{state.error}</Alert>}

        <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
          <div>
            <span className="grid place-items-center overflow-hidden rounded border border-line-strong bg-surface p-2">
              <Image
                src={item.url} alt="" width={item.width ?? 200} height={item.height ?? 150}
                className="max-h-[150px] w-auto object-contain" unoptimized
              />
            </span>
            <p className="mt-1.5 text-center text-12 text-muted">
              {item.width} × {item.height} px now
            </p>
          </div>

          <div>
            <p className="mb-3 text-13-5 font-semibold">Set a new size</p>

            <Field label="Width" htmlFor={`w-${item.id}`}>
              <Input
                id={`w-${item.id}`} name="width" type="number" min={1} max={6000}
                value={width || ""} onChange={(e) => changeWidth(Number(e.target.value))} required
              />
            </Field>

            <Field label="Height" htmlFor={`h-${item.id}`}>
              <Input
                id={`h-${item.id}`} name="height" type="number" min={1} max={6000}
                value={height || ""} onChange={(e) => changeHeight(Number(e.target.value))} required
              />
            </Field>

            <label htmlFor={lockId} className="mb-5 flex cursor-pointer items-center gap-2 text-13-5">
              <input
                id={lockId} type="checkbox" checked={locked}
                onChange={(e) => setLocked(e.target.checked)}
              />
              Lock aspect ratio
            </label>

            <p className="mb-2 text-13-5 font-semibold">Create a new thumbnail</p>
            <p className="mb-2.5 text-12-5 text-muted">
              Square, cropped from the middle rather than squashed — a 4:3 photo
              keeps its proportions. Each is saved as its own file in this
              folder, so you can use it anywhere.
            </p>
            <div className="grid gap-1.5">
              {THUMBNAILS.map((t) => (
                <label key={t.size} className="flex cursor-pointer items-center gap-2 text-13-5">
                  <input type="checkbox" name="thumbnails" value={t.size} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className={cn("mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4")}>
          <Button type="submit" pending={pending}>{pending ? "Resizing…" : "OK"}</Button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
          <KeepOriginalToggle id={`resize-copy-${item.id}`} />
        </div>
      </Form>
    </Dialog>
  );
}

/**
 * The facts about a file that are read rather than edited.
 *
 * Read-only on purpose: dimensions and size are results of the file, not
 * fields — an editable width here would be a resize wearing the wrong shape,
 * and the Resize dialog already owns that. Showing them beside the fields that
 * *are* editable is what makes the distinction obvious.
 *
 * The URL is the one thing here somebody actually needs to take away, hence
 * the copy button. It copies the **public URL**, while the tile's own "Select"
 * action copies the storage **path** — two different strings for two different
 * jobs, which is exactly why each says which it is rather than both saying
 * "Copy". A record stores the path; a colleague pasting into an email wants
 * the URL.
 */
function MediaFacts({ item }: { item: MediaItem }) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      // Reverts, because a button stuck on "Copied" stops reporting anything
      // the second time it is pressed.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Blocked in some contexts. The field below is selectable either way.
      setCopied(false);
    }
  };

  return (
    <div className="mb-[18px] rounded border border-line bg-surface px-3 py-2.5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-12-5">
        <Fact label="Uploaded" value={formatDate(item.created_at)} />
        <Fact label="Modified" value={formatDate(item.updated_at)} />
        <Fact label="Size" value={readableSize(item.size)} />
        <Fact
          label="Dimensions"
          // An SVG has no intrinsic pixel size, which is why both columns are
          // nullable — saying so beats printing "null x null".
          value={item.width && item.height ? `${item.width} x ${item.height} px` : "—"}
        />
        <Fact label="Type" value={item.mime} />
        <Fact label="Uploaded by" value={item.uploaded_by ?? "—"} />
      </dl>

      <div className="mt-2.5 border-t border-line pt-2.5">
        <span className="mb-1 block text-11 font-semibold text-faint">Public URL</span>
        <div className="flex gap-2">
          <Input
            readOnly
            value={item.url}
            aria-label="Public URL"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 px-2 py-1.5 font-mono text-12 text-muted"
          />
          <button
            type="button"
            onClick={copyUrl}
            className="shrink-0 rounded border border-line-strong bg-card px-2.5 py-1.5 text-12-5 font-semibold hover:border-faint"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint">{label}</dt>
      <dd className="truncate font-medium" title={value}>{value}</dd>
    </div>
  );
}

/**
 * Swap the bytes behind a file, keeping its address.
 *
 * The reason this exists rather than "delete and upload a new one": records
 * store a **path**, so replacing in place updates every page already showing
 * the image, while a new upload gets a new hashed name and leaves all of them
 * pointing at a file that no longer exists.
 *
 * The extension cannot change, and the API refuses it rather than accepting a
 * JPEG at a `.png` address — the content type is served from the file on disk,
 * not from the row, so the mismatch would be real rather than cosmetic.
 */
export function ReplaceDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<ReplaceState>({});
  // Bytes, from the request itself: a replacement is often the largest
  // upload in the library, and it used to be a stripe with no number.
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const pending = progress !== null;
  const extension = item.filename.includes(".") ? item.filename.split(".").pop()!.toLowerCase() : "";

  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  const replace = (file: File) => {
    if (pending) return;
    setState({});
    setProgress({ done: 0, total: 1, label: file.name, percent: 0 });
    const data = new FormData();
    data.append("file", file);
    uploadWithProgress<{ data?: MediaItem }>(`/api/admin/media/${item.id}/replace`, data, {
      onProgress: (loaded, total) => setProgress({
        done: 0, total: 1, label: file.name, percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          setState({ error: res.status === 401 ? "Your session has expired. Reload the page." : refusalMessage(res.body, "That file could not be replaced.") });
          return;
        }
        // The grid reads the library on the server; the versioned URL is what
        // makes the new bytes show. What the action's revalidatePath did.
        router.refresh();
        setState({ ok: true });
      })
      .catch(() => setState({ error: "The upload did not complete. Try again." }))
      .finally(() => setProgress(null));
  };

  return (
    <Dialog title={`Overwrite ${item.filename}`} onClose={onClose}>
      <div>
        {state.error && <Alert tone="err" title="Could not replace it">{state.error}</Alert>}

        <p className="mb-4 text-13-5 text-muted">
          The new file takes this one&rsquo;s address, so every page already
          using it shows the new picture. The previous version is kept in the
          file&rsquo;s history and can be put back.
        </p>

        <FileDrop
          accept={extension ? `.${extension}` : undefined}
          label="Select the replacement…"
          hint={extension
            ? `Must be another .${extension} file — that extension is part of the address records already point at.`
            : undefined}
          progress={progress}
          onFiles={(files) => {
            const file = files[0];
            if (file) replace(file);
          }}
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
          <span className="ml-auto text-12-5 text-faint">
            Choosing a file replaces it immediately.
          </span>
        </div>
      </div>
    </Dialog>
  );
}
