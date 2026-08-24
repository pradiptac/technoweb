"use client";

import Image from "next/image";
import { useActionState, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import {
  IconArrowRight, IconCheck, IconClose, IconLayers, IconPen, IconSearchChart,
} from "@/components/icons";
import { renameMediaAction, resizeMediaAction, type RenameState, type ResizeState } from "./actions";
import { Dialog, ItemMenu } from "./item-menu";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/api";

const THUMBNAILS = [
  { size: 90, label: "Small (90×90)" },
  { size: 120, label: "Medium (120×120)" },
  { size: 180, label: "Large (180×180)" },
] as const;

/** Bytes to something a person reads. */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaCard({
  item, returnTo, onDelete,
}: {
  item: MediaItem;
  /** The current query string, so an action returns to this view. */
  returnTo: string;
  onDelete: (item: MediaItem) => void;
}) {
  const [dialog, setDialog] = useState<"rename" | "resize" | null>(null);
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
    <li className="relative overflow-hidden rounded-lg border border-line-strong bg-white">
      <ItemMenu
        label={item.filename}
        actions={[
          { label: copied ? "Path copied" : "Select (copy path)", icon: <IconCheck />, onSelect: copyPath },
          { label: "View", icon: <IconSearchChart />, onSelect: () => window.open(item.url, "_blank", "noopener") },
          { label: "Download", icon: <IconArrowRight />, onSelect: () => { window.location.href = item.download_url; } },
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
          { label: "Rename", icon: <IconPen />, onSelect: () => setDialog("rename") },
          { label: "Delete", icon: <IconClose />, danger: true, onSelect: () => onDelete(item) },
        ]}
      >
        <span className="grid h-40 cursor-context-menu place-items-center overflow-hidden border-b border-line bg-surface">
          {item.is_image ? (
            <Image
              src={item.url}
              alt={item.alt_text ?? ""}
              width={item.width ?? 320}
              height={item.height ?? 160}
              className="max-h-40 w-auto object-contain"
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

      <div className="p-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium" title={item.filename}>{item.filename}</p>
            <p className="mt-0.5 text-[12px] text-muted">
              {readableSize(item.size)}
              {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
            </p>
          </div>
        </div>

        {/* The storable path, not the URL — this is what a record's image
            field holds, and select-all makes it copyable without the menu. */}
        <p className="mt-2 truncate rounded bg-surface px-2 py-1.5 font-mono text-[11.5px] text-muted select-all">
          {item.path}
        </p>
        {copied && <p className="mt-1 text-[12px] text-ok">Path copied to the clipboard.</p>}
      </div>

      {dialog === "rename" && (
        <RenameDialog item={item} onClose={() => setDialog(null)} />
      )}
      {dialog === "resize" && (
        <ResizeDialog item={item} onClose={() => setDialog(null)} />
      )}

      <input type="hidden" value={returnTo} readOnly />
    </li>
  );
}

function RenameDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [state, action, pending] = useActionState<RenameState, FormData>(renameMediaAction, {});

  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  return (
    <Dialog title={`Rename ${item.filename}`} onClose={onClose}>
      <form action={action}>
        <input type="hidden" name="id" value={item.id} />
        {state.error && <Alert tone="err" title="Could not rename">{state.error}</Alert>}

        <Field
          label="File name"
          htmlFor={`rename-${item.id}`}
          hint="A label only. The stored file keeps its own name, so nothing already pointing at it breaks."
        >
          <Input id={`rename-${item.id}`} name="filename" defaultValue={item.filename} required />
        </Field>

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
      </form>
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
      <form action={action}>
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
              Each one is saved as its own file in this folder, so you can use it anywhere.
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
          <span className="ml-auto text-[12.5px] text-muted">
            This replaces the original file.
          </span>
        </div>
      </form>
    </Dialog>
  );
}
