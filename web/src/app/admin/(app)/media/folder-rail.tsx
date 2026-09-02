"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Input } from "@/components/ui/input";
import { IconClose, IconGrid, IconLayers } from "@/components/icons";
import { createFolderAction, deleteFolderAction, type FolderState } from "./actions";
import { Dialog, ItemMenu } from "./item-menu";
import { cn } from "@/lib/utils";
import type { MediaFolder } from "@/types/api";

/**
 * The folder rail.
 *
 * Selection lives in the URL rather than in state: a filtered view of a media
 * library is a thing people send each other and come back to, and it has to
 * survive the reload that every upload and delete performs.
 */
export function FolderRail({
  folders, current, kind, total,
}: {
  folders: MediaFolder[];
  /** An id as a string, "unfiled", or undefined for everything. */
  current?: string;
  kind: string;
  total: number;
}) {
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<MediaFolder | null>(null);

  const href = (folder?: string) => {
    const q = new URLSearchParams();
    if (kind) q.set("kind", kind);
    if (folder) q.set("folder", folder);
    const s = q.toString();
    return `/admin/media${s ? `?${s}` : ""}`;
  };

  const row = "flex w-full items-center gap-2 rounded px-2.5 py-2 text-[13.5px] [&_svg]:size-4 [&_svg]:shrink-0";

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="px-1 text-[11px] font-semibold tracking-[.08em] text-faint uppercase">Folders</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(true)}>
          + New
        </Button>
      </div>

      <ul className="grid gap-0.5">
        <li>
          <Link
            href={href()}
            aria-current={!current ? "page" : undefined}
            className={cn(row, !current
              ? "bg-brand-600 font-semibold text-white"
              : "text-muted hover:bg-surface-2 hover:text-ink")}
          >
            <IconGrid />
            All {kind === "file" ? "files" : "images"}
            <span className={cn("ml-auto text-[12px]", !current ? "text-white" : "text-faint")}>{total}</span>
          </Link>
        </li>

        <li>
          <Link
            href={href("unfiled")}
            aria-current={current === "unfiled" ? "page" : undefined}
            className={cn(row, current === "unfiled"
              ? "bg-brand-600 font-semibold text-white"
              : "text-muted hover:bg-surface-2 hover:text-ink")}
          >
            <IconLayers />
            Unfiled
          </Link>
        </li>

        {folders.map((f) => {
          const active = current === String(f.id);
          return (
            <li key={f.id} className="flex items-center gap-1">
              <ItemMenu
                label={`folder ${f.name}`}
                actions={[{
                  label: "Delete folder",
                  icon: <IconClose />,
                  danger: true,
                  onSelect: () => setConfirming(f),
                }]}
              >
                <Link
                  href={href(String(f.id))}
                  aria-current={active ? "page" : undefined}
                  className={cn(row, "min-w-0 flex-1", active
                    ? "bg-brand-600 font-semibold text-white"
                    : "text-muted hover:bg-surface-2 hover:text-ink")}
                >
                  <IconLayers />
                  <span className="truncate">{f.name}</span>
                  <span className={cn("ml-auto text-[12px]", active ? "text-white" : "text-faint")}>
                    {f.media_count}
                  </span>
                </Link>
              </ItemMenu>
            </li>
          );
        })}
      </ul>

      {creating && <NewFolderDialog onClose={() => setCreating(false)} />}

      {confirming && (
        <Dialog title={`Delete ${confirming.name}?`} onClose={() => setConfirming(null)}>
          <p className="mb-1 text-[14px]">
            The folder goes; the {confirming.media_count}{" "}
            {confirming.media_count === 1 ? "file" : "files"} in it do not.
          </p>
          <p className="mb-5 text-[13px] text-muted">
            They move to Unfiled, where you can find them again. Nothing on the
            public site changes — a file keeps the same path whichever folder
            it is listed under.
          </p>
          <Form action={deleteFolderAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={confirming.id} />
            <Button type="submit" variant="destructive">Delete folder</Button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
          </Form>
        </Dialog>
      )}
    </div>
  );
}

function NewFolderDialog({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState<FolderState, FormData>(createFolderAction, {});

  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  return (
    <Dialog title="New folder" onClose={onClose}>
      <Form action={action} state={state}>
        {state.error && <Alert tone="err" title="Could not create it">{state.error}</Alert>}
        <label htmlFor="folder-name" className="mb-1.5 block text-[13.5px] font-semibold">
          Folder name
        </label>
        <Input id="folder-name" name="name" required maxLength={80} placeholder="Product photography" />
        <p className="mt-1.5 mb-5 text-[12.5px] text-faint">
          Folders are for finding things again. Moving a file between them never
          changes its path, so nothing on the site breaks.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create folder"}</Button>
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
