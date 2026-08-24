"use client";

import { FileInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useUpload } from "./upload-context";

/**
 * The toolbar's file input, and the status line for every upload however it
 * started — through this control or dropped onto the grid.
 *
 * Renders as fields, not a block: it is a child of the toolbar form, and the
 * outcome is a line of text rather than an Alert because an Alert here pushed
 * the whole grid down every time a file landed.
 */
export function MediaUploader({ folderId }: { folderId?: string }) {
  const { upload, progress, pending, message } = useUpload();

  return (
    <>
      {/*
        A field in the toolbar rather than a dashed panel of its own. The
        panel was 125px of a 471px run-up before the first thumbnail, on a
        screen whose entire job is showing thumbnails.

        No `name` on the input, so sitting inside the search form does not
        put it in the GET query.
      */}
      <div className="min-w-0">
        <label htmlFor="media-file" className="mb-0.5 block text-[11px] font-semibold text-faint">
          {folderId && folderId !== "unfiled" ? "Upload here" : "Upload"}
        </label>
        <FileInput
          id="media-file"
          multiple
          accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          title="Images or documents — PNG, JPG, GIF, WebP, SVG, PDF, Word, Excel, CSV, TXT, ZIP. Up to 5 MB each. Several at once, or drag them onto the grid."
          className="min-w-[240px]"
          onChange={(e) => {
            const files = e.currentTarget.files;
            if (!files?.length) return;
            // Cleared so the same file can be chosen again after a failure.
            const chosen = Array.from(files);
            e.currentTarget.value = "";
            upload(chosen);
          }}
        />
      </div>

      {pending && (
        <p className="self-end pb-2 text-[12.5px] text-muted" role="status">
          Uploading {progress}…
        </p>
      )}

      {message && (
        <p
          role={message.tone === "err" ? "alert" : "status"}
          className={cn(
            "basis-full text-[12.5px]",
            message.tone === "err" ? "text-err" : "text-ok",
          )}
        >
          {message.text}
        </p>
      )}
    </>
  );
}
