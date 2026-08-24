"use client";

import { useState, useTransition } from "react";
import { FileInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { uploadMediaAction } from "./actions";

/**
 * Uploads on selection, like the cover and gallery pickers.
 *
 * The action is awaited from the change handler rather than driven through
 * useActionState so the result can be held alongside a local pending flag
 * without syncing state from an effect.
 *
 * Renders as fields, not a block: it is a child of the toolbar form, and the
 * outcome is a line of text rather than an Alert because an Alert here pushed
 * the whole grid down every time a file landed.
 */
export function MediaUploader({ folderId }: { folderId?: string }) {
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startUpload] = useTransition();

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
          accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          title="Images or documents — PNG, JPG, GIF, WebP, SVG, PDF, Word, Excel, CSV, TXT, ZIP. Up to 5 MB."
          className="min-w-[240px]"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (!file) return;

            const data = new FormData();
            data.append("file", file);
            // Uploads land where you are looking. "unfiled" is a view, not a
            // folder, so it carries no id.
            if (folderId && folderId !== "unfiled") data.append("folder_id", folderId);
            // Cleared so the same file can be chosen again after a failure.
            e.currentTarget.value = "";

            startUpload(async () => {
              const result = await uploadMediaAction({}, data);
              setMessage(result.error
                ? { tone: "err", text: result.error }
                : { tone: "ok", text: `${result.uploaded} uploaded.` });
            });
          }}
        />
      </div>

      {pending && <p className="self-end pb-2 text-[12.5px] text-muted">Uploading…</p>}

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
