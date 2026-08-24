"use client";

import { useState, useTransition } from "react";
import { Alert, FileInput } from "@/components/ui/input";
import { uploadMediaAction } from "./actions";

/**
 * Uploads on selection, like the cover and gallery pickers.
 *
 * The action is awaited from the change handler rather than driven through
 * useActionState so the result can be held alongside a local pending flag
 * without syncing state from an effect.
 */
export function MediaUploader({ folderId }: { folderId?: string }) {
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startUpload] = useTransition();

  return (
    <div className="mb-6 rounded-lg border border-dashed border-line-strong bg-white p-4">
      <label htmlFor="media-file" className="mb-1.5 block text-[13.5px] font-semibold">
        {folderId && folderId !== "unfiled" ? "Upload into this folder" : "Upload a file"}
      </label>
      <FileInput
        id="media-file"
        accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
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
      <p className="mt-1.5 text-[12.5px] text-faint">
        {pending ? "Uploading…" : "Images or documents — PNG, JPG, GIF, WebP, SVG, PDF, Word, Excel, CSV, TXT, ZIP. Up to 5 MB."}
      </p>

      {message && (
        <div className="mt-3">
          <Alert tone={message.tone} title={message.tone === "ok" ? "Uploaded" : "Upload failed"}>
            {message.text}
          </Alert>
        </div>
      )}
    </div>
  );
}
