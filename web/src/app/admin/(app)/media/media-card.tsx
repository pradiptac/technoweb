"use client";

import Image from "next/image";
import { Form } from "@/components/ui/form";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  IconArrowRight, IconCheck, IconClose, IconGrid, IconLayers, IconPen, IconSearchChart,
} from "@/components/icons-ui";
import { purgeMediaAction, restoreMediaAction } from "./actions";
import { Dialog, ItemMenu } from "./item-menu";
import { CropDialog } from "./crop-dialog";
import { EditImageDialog } from "./edit-image-dialog";
import { cn } from "@/lib/utils";
import { type MediaItem } from "@/types/api";
import { RenameDialog, ReplaceDialog, ResizeDialog } from "./media-dialogs";

/** Bytes to something a person reads. */
export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaCard({
  item, returnTo, onDelete, onPreview, selected, onToggleSelect, trashed = false,
  priority = false,
}: {
  item: MediaItem;
  /**
   * Load this tile eagerly.
   *
   * The grid is newest-first and the library holds whatever was last uploaded,
   * so the largest thing above the fold is a real photograph — and a lazy LCP
   * element is a Next warning that `npm run audit` fails on. Set for the first
   * row only; everything below the fold stays lazy, which is the whole point
   * of a library that can hold a hundred files.
   */
  priority?: boolean;
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
          {
            label: "Download",
            icon: <IconArrowRight />,
            /*
              A synthesised `<a download>` rather than `window.location.href`.
              This menu only takes an `onSelect`, and a download is not a
              navigation: `router.push()` would do a client-side route change
              and fetch nothing, and assigning `location.href` is what Next's
              own lint rule warns about for an internal path.

              The URL is this app's proxy, never the API's own — the token is
              in an httpOnly cookie the browser cannot attach to a request at
              the API origin, and Laravel answers such a request with a 500
              rather than a 401 because a navigation cannot send
              `Accept: application/json`.
            */
            onSelect: () => {
              const a = document.createElement("a");
              a.href = `/api/admin/media/${item.id}/download`;
              a.download = item.filename ?? "";
              document.body.appendChild(a);
              a.click();
              a.remove();
            },
          },
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
              priority={priority}
              unoptimized
            />
          ) : (
            <span className="grid place-items-center gap-1.5 text-muted">
              <IconLayers className="size-7" />
              <span className="font-mono text-11-5 uppercase">
                {item.filename.split(".").pop()}
              </span>
            </span>
          )}
        </span>
      </ItemMenu>

      <div className="p-2.5">
        <div className="min-w-0">
            <p className="truncate text-13 font-medium" title={item.filename}>{item.filename}</p>
            <p className="text-11-5 text-muted">
              {readableSize(item.size)}
              {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
            </p>
        </div>

        {/* The storable path, not the URL — this is what a record's image
            field holds, and select-all makes it copyable without the menu. */}
        {/* The storable path is this screen's whole point, so it stays
            visible — just on one tight line rather than its own block. */}
        <p className="mt-1.5 truncate rounded bg-surface px-1.5 py-1 font-mono text-11 text-muted select-all" title={item.path}>
          {item.path}
        </p>
        {copied && <p className="mt-1 text-11-5 text-ok">Path copied.</p>}
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
          <p className="mb-5 text-13-5">
            It goes back to the library at the same address, so anything still
            pointing at{" "}
            <span className="font-mono text-12-5">{item.path}</span>{" "}
            starts working again.
          </p>
          <Form action={restoreMediaAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Button type="submit">Restore it</Button>
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="cursor-pointer rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
          </Form>
        </Dialog>
      )}

      {dialog === "purge" && (
        <Dialog title={`Delete ${item.filename} permanently?`} onClose={() => setDialog(null)}>
          <p className="mb-1 text-14">This cannot be undone.</p>
          <p className="mb-5 text-13 text-muted">
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
              className="cursor-pointer rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
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
