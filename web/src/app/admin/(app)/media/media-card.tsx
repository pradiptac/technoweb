"use client";

import Image from "next/image";
import { Form } from "@/components/ui/form";
import { useActionState, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, KeepOriginalToggle, Textarea } from "@/components/ui/input";
import {
  IconArrowRight, IconCheck, IconClose, IconGrid, IconLayers, IconPen, IconSearchChart,
} from "@/components/icons";
import {
  purgeMediaAction, renameMediaAction, replaceMediaAction, resizeMediaAction,
  restoreMediaAction, type RenameState, type ReplaceState, type ResizeState,
} from "./actions";
import { FileDrop } from "@/components/ui/file-drop";
import { Dialog, ItemMenu } from "./item-menu";
import { CropDialog } from "./crop-dialog";
import { EditImageDialog } from "./edit-image-dialog";
import { cn } from "@/lib/utils";
import { THUMBNAIL_SIZES, type MediaItem, type ThumbnailSize } from "@/types/api";

/*
  Derived from the shared whitelist, not a second copy of it.

  `Record<ThumbnailSize, string>` is the point: add a fourth size to the type
  and this stops compiling until it has a name, rather than the dialog quietly
  offering three of four. The API accepts exactly these three and 422s the
  rest, so both ends now read from one list.
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

/** Bytes to something a person reads. */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaCard({
  item, returnTo, onDelete, onPreview, selected, onToggleSelect, trashed = false,
}: {
  item: MediaItem;
  /** The current query string, so an action returns to this view. */
  returnTo: string;
  onDelete: (item: MediaItem) => void;
  /** Opens the full-screen preview at this card's position in the grid. */
  onPreview: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  /** In the bin: restore or destroy, and nothing that assumes a live file. */
  trashed?: boolean;
}) {
  const [dialog, setDialog] = useState<
    "rename" | "resize" | "crop" | "edit" | "replace" | "restore" | "purge" | null
  >(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(item.path);
      setCopied(true);
    } catch {
      // Clipboard is blocked in some contexts; the path is select-all below.
      setCopied(false);
    }
  };

  return (
    <li
      className={cn(
        // `group/tile` is what the checkbox's hover reveal hangs off. Named
        // rather than a bare `group`, because the tile already sits inside
        // other groups and an unnamed one would answer to the nearest.
        "group/tile relative overflow-hidden rounded-lg border bg-card",
        // The selected state is a real border rather than an outline or a
        // ring, so it cannot be clipped by the tile's own `overflow-hidden`.
        selected ? "border-brand-600 ring-1 ring-brand-600" : "border-line-strong",
      )}
    >
      {/*
        A real checkbox, positioned over the thumbnail.

        Not a click-the-tile-to-select gesture: the tile already opens a
        context menu and the thumbnail is the thing being *looked* at, so
        making the whole card a toggle takes away the ability to examine one
        without altering a selection. A checkbox is also the only version of
        this a keyboard reaches, and it labels itself.

        It sits above the menu's own trigger in the stacking order because both
        occupy the tile's top corners.
      */}
      <label
        className={cn(
          "absolute top-1.5 left-1.5 z-10 flex size-7 cursor-pointer items-center justify-center rounded",
          "border transition-colors",
          selected
            ? "border-brand-600 bg-brand-600"
            : "border-line-strong bg-card/90 opacity-0 focus-within:opacity-100 hover:opacity-100 group-hover/tile:opacity-100",
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="size-4 cursor-pointer accent-brand-600"
        />
        <span className="sr-only">{`Select ${item.filename}`}</span>
      </label>
      <ItemMenu
        label={item.filename}
        actions={trashed ? [
          /*
            A binned file offers two things and no others.

            Everything else in this menu assumes a live file: cropping one that
            has been deleted is not something anybody means to do, and "copy
            path" would hand out an address that currently renders nothing.
          */
          { label: "Restore", icon: <IconCheck />, onSelect: () => setDialog("restore") },
          { label: "Delete permanently", icon: <IconClose />, danger: true, onSelect: () => setDialog("purge") },
        ] : [
          { label: copied ? "Path copied" : "Select (copy path)", icon: <IconCheck />, onSelect: copyPath },
          /*
            Opens the preview rather than a new tab.

            The tab version left the console entirely, showed the file on the
            API's origin with no name and no size, and made "look at the next
            one" a matter of going back and starting again.
          */
          { label: "View", icon: <IconSearchChart />, onSelect: onPreview },
          { label: "Download", icon: <IconArrowRight />, onSelect: () => { window.location.href = item.download_url; } },
          {
            label: "Crop",
            icon: <IconGrid />,
            onSelect: () => setDialog("crop"),
            disabled: !item.is_image || item.mime === "image/svg+xml",
            disabledReason: item.mime === "image/svg+xml"
              ? "An SVG has no pixels to cut."
              : "Only images can be cropped.",
          },
          {
            label: "Edit image",
            icon: <IconPen />,
            onSelect: () => setDialog("edit"),
            // Same rule as crop and resize: GD cannot turn a vector, and the
            // API refuses it. Saying so here beats opening a dialog whose
            // every button can only fail.
            disabled: !item.is_image || item.mime === "image/svg+xml",
            disabledReason: item.mime === "image/svg+xml"
              ? "An SVG has no pixels to rotate or adjust."
              : "Only images can be edited.",
          },
          {
            label: "Resize",
            icon: <IconLayers />,
            onSelect: () => setDialog("resize"),
            // GD cannot scale a vector, and the API refuses it. Saying so
            // here is better than opening a dialog that can only fail.
            disabled: !item.is_image || item.mime === "image/svg+xml",
            disabledReason: item.mime === "image/svg+xml"
              ? "An SVG has no pixel size to change."
              : "Only images can be resized.",
          },
          {
            label: "Overwrite",
            icon: <IconLayers />,
            onSelect: () => setDialog("replace"),
          },
          { label: "Edit details", icon: <IconPen />, onSelect: () => setDialog("rename") },
          { label: "Delete", icon: <IconClose />, danger: true, onSelect: () => onDelete(item) },
        ]}
      >
        <span className="grid h-28 cursor-context-menu place-items-center overflow-hidden border-b border-line bg-surface">
          {item.is_image ? (
            <Image
              src={item.url}
              alt={item.alt_text ?? ""}
              width={item.width ?? 320}
              height={item.height ?? 160}
              className="max-h-28 w-auto object-contain"
              unoptimized
            />
          ) : (
            <span className="grid place-items-center gap-1.5 text-muted">
              <IconLayers className="size-7" />
              <span className="font-mono text-[11.5px] uppercase">
                {item.filename.split(".").pop()}
              </span>
            </span>
          )}
        </span>
      </ItemMenu>

      <div className="p-2.5">
        <div className="min-w-0">
            <p className="truncate text-[13px] font-medium" title={item.filename}>{item.filename}</p>
            <p className="text-[11.5px] text-muted">
              {readableSize(item.size)}
              {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
            </p>
        </div>

        {/* The storable path, not the URL — this is what a record's image
            field holds, and select-all makes it copyable without the menu. */}
        {/* The storable path is this screen's whole point, so it stays
            visible — just on one tight line rather than its own block. */}
        <p className="mt-1.5 truncate rounded bg-surface px-1.5 py-1 font-mono text-[11px] text-muted select-all" title={item.path}>
          {item.path}
        </p>
        {copied && <p className="mt-1 text-[11.5px] text-ok">Path copied.</p>}
      </div>

      {dialog === "rename" && (
        <RenameDialog item={item} onClose={() => setDialog(null)} />
      )}
      {dialog === "resize" && (
        <ResizeDialog item={item} onClose={() => setDialog(null)} />
      )}
      {dialog === "crop" && (
        <CropDialog item={item} onClose={() => setDialog(null)} />
      )}

      {dialog === "edit" && (
        <EditImageDialog item={item} onClose={() => setDialog(null)} />
      )}

      {dialog === "replace" && (
        <ReplaceDialog item={item} onClose={() => setDialog(null)} />
      )}

      {dialog === "restore" && (
        <Dialog title={`Restore ${item.filename}?`} onClose={() => setDialog(null)}>
          <p className="mb-5 text-[13.5px]">
            It goes back to the library at the same address, so anything still
            pointing at{" "}
            <span className="font-mono text-[12.5px]">{item.path}</span>{" "}
            starts working again.
          </p>
          <Form action={restoreMediaAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Button type="submit">Restore it</Button>
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
          </Form>
        </Dialog>
      )}

      {dialog === "purge" && (
        <Dialog title={`Delete ${item.filename} permanently?`} onClose={() => setDialog(null)}>
          <p className="mb-1 text-[14px]">This cannot be undone.</p>
          <p className="mb-5 text-[13px] text-muted">
            The file, and every archived version of it, are removed from disk.
            Anything still pointing at that address will show a broken image
            with no way back.
          </p>
          <Form action={purgeMediaAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Button type="submit" variant="destructive">Delete permanently</Button>
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
          </Form>
        </Dialog>
      )}

      <input type="hidden" value={returnTo} readOnly />
    </li>
  );
}

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
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </Form>
    </Dialog>
  );
}

function ResizeDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
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
            <p className="mt-1.5 text-center text-[12px] text-muted">
              {item.width} × {item.height} px now
            </p>
          </div>

          <div>
            <p className="mb-3 text-[13.5px] font-semibold">Set a new size</p>

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

            <label htmlFor={lockId} className="mb-5 flex cursor-pointer items-center gap-2 text-[13.5px]">
              <input
                id={lockId} type="checkbox" checked={locked}
                onChange={(e) => setLocked(e.target.checked)}
              />
              Lock aspect ratio
            </label>

            <p className="mb-2 text-[13.5px] font-semibold">Create a new thumbnail</p>
            <p className="mb-2.5 text-[12.5px] text-muted">
              Square, cropped from the middle rather than squashed — a 4:3 photo
              keeps its proportions. Each is saved as its own file in this
              folder, so you can use it anywhere.
            </p>
            <div className="grid gap-1.5">
              {THUMBNAILS.map((t) => (
                <label key={t.size} className="flex cursor-pointer items-center gap-2 text-[13.5px]">
                  <input type="checkbox" name="thumbnails" value={t.size} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className={cn("mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4")}>
          <Button type="submit" disabled={pending}>{pending ? "Resizing…" : "OK"}</Button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
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
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
        <Fact label="Uploaded" value={formatDate(item.created_at)} />
        <Fact label="Modified" value={formatDate(item.updated_at)} />
        <Fact label="Size" value={formatBytes(item.size)} />
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
        <span className="mb-1 block text-[11px] font-semibold text-faint">Public URL</span>
        <div className="flex gap-2">
          <input
            readOnly
            value={item.url}
            aria-label="Public URL"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded border border-line-strong bg-card px-2 py-1.5 font-mono text-[12px] text-muted"
          />
          <button
            type="button"
            onClick={copyUrl}
            className="shrink-0 rounded border border-line-strong bg-card px-2.5 py-1.5 text-[12.5px] font-semibold hover:border-faint"
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Rendered in the browser's own locale rather than a fixed format.
 *
 * This is a client component, so there is no server render of this string to
 * disagree with — the hydration mismatch that a locale-dependent date causes
 * in a server component cannot arise here.
 */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
function ReplaceDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [state, action, pending] = useActionState<ReplaceState, FormData>(replaceMediaAction, {});
  const extension = item.filename.includes(".") ? item.filename.split(".").pop()!.toLowerCase() : "";

  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  return (
    <Dialog title={`Overwrite ${item.filename}`} onClose={onClose}>
      <Form action={action} state={state}>
        <input type="hidden" name="id" value={item.id} />
        {state.error && <Alert tone="err" title="Could not replace it">{state.error}</Alert>}

        <p className="mb-4 text-[13.5px] text-muted">
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
          progress={pending ? { done: 0, total: 1 } : null}
          onFiles={(files) => {
            const file = files[0];
            if (!file) return;
            const data = new FormData();
            data.append("id", String(item.id));
            data.append("file", file);
            action(data);
          }}
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
          <span className="ml-auto text-[12.5px] text-faint">
            Choosing a file replaces it immediately.
          </span>
        </div>
      </Form>
    </Dialog>
  );
}
