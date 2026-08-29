"use client";

import { FileDrop } from "@/components/ui/file-drop";
import { cn } from "@/lib/utils";
import { useUpload } from "./upload-context";

/**
 * The library's upload panel, and the status line for every upload however it
 * started — through this control or dropped onto the grid.
 *
 * **This replaced a file input in the toolbar row**, which was itself a
 * deliberate change away from a dashed panel: the panel cost 125px of a 471px
 * run-up before the first thumbnail, on a screen whose entire job is showing
 * thumbnails. That reasoning still holds and the panel is back anyway, because
 * one upload control used everywhere beats a different one per screen — a drag
 * target that exists on one screen and not the next is a feature only the
 * person who wrote it knows about. It is kept as short as the shared component
 * allows and sits above the grid rather than between the filters and the
 * files.
 */
const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip";

export function MediaUploader({ folderId }: { folderId?: string }) {
  const { upload, progress, message } = useUpload();
  const filed = Boolean(folderId && folderId !== "unfiled");

  /*
    A folder upload is flattened, and the panel says so.

    `webkitdirectory` hands over every file in the tree — but this library's
    folders are a flat label on a row, not a path, so the structure cannot be
    preserved and pretending otherwise would be the lie. Everything lands
    wherever the current view points, which is the same rule a file upload
    follows.
  */
  return (
    <div className="mb-3">
      <FileDrop
        multiple
        accept={ACCEPT}
        onFiles={upload}
        progress={progress}
        label="Select files…"
        hint={
          <>
            Images or documents — up to 5 MB each.
            {filed && " They land in the folder you are looking at."}
          </>
        }
      >
        {/*
          A plain label and input, **not** a nested `FileDrop`.

          A drop zone inside a drop zone means both handlers fire for one drop
          and the files upload twice — the same defect the outer grid target
          already had to be fixed for. This needs no drop behaviour of its own:
          a folder is chosen through the picker, and dropping one is already
          handled by the zone around it.
        */}
        <div className="mt-3 border-t border-line pt-3">
          <label
            htmlFor="media-folder-upload"
            className="cursor-pointer text-[12.5px] font-semibold text-brand-ink underline-offset-2 hover:underline"
          >
            …or select a whole folder
          </label>
          <input
            id="media-folder-upload"
            type="file"
            multiple
            accept={ACCEPT}
            // Non-standard, unprefixed nowhere, implemented everywhere.
            {...({ webkitdirectory: "" } as Record<string, string>)}
            disabled={progress !== null}
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              if (files.length) upload(files);
            }}
            className="sr-only"
          />
          <p className="mt-1 text-[12.5px] text-faint">
            Everything inside it, including subfolders. The structure is not
            kept — this library files by label, not by path.
          </p>
        </div>
      </FileDrop>

      {message && (
        <p
          role={message.tone === "err" ? "alert" : "status"}
          className={cn(
            "mt-1.5 text-[12.5px]",
            message.tone === "err" ? "text-err" : "text-ok",
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
