"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/file-drop";
import { cn } from "@/lib/utils";
import { useUpload } from "./upload-context";

/**
 * Uploading, as two toolbar buttons rather than a panel.
 *
 * **This is the third arrangement and the argument that settles it is the
 * screen's own purpose.** It began as a file input in the filter row, became a
 * dashed drop panel so that one shared control was used product-wide, and that
 * panel cost roughly 300px above the first thumbnail — on a library whose
 * entire job is showing thumbnails. At 1080p the first viewport held the tabs,
 * a summary line, a 300px invitation to upload and the filters, and **not one
 * picture**. The panel's own docblock conceded the cost and kept it anyway.
 *
 * What makes the panel redundant *here specifically* is that this is the only
 * screen in the product where the whole content column is already a drop
 * target: `DropZone` wraps the grid and shows its own overlay the moment
 * something is dragged over it. A dashed rectangle saying "or drag them here"
 * is a second, smaller invitation to do the thing the entire page already
 * accepts. Everywhere else — ticket attachments, a CV, a cover picker — has no
 * ambient target, so `FileDrop` stays exactly as it is there. The rule was
 * never "the same rectangle on every screen"; it was one upload routine and
 * one progress rendering, and both still hold.
 *
 * Split in two because the two halves belong in different places. `Upload`
 * sits inside the filter row, which is where the upload context's own docblock
 * always said it was. `UploadStatus` renders **nothing at all** when idle and
 * sits above the grid — a status line inside a flex row of labelled controls
 * would either stretch the row or be squeezed by it.
 */
const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip";

export function Upload({ folderId }: { folderId?: string }) {
  const { upload, progress } = useUpload();
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const filed = Boolean(folderId && folderId !== "unfiled");

  /*
    Real buttons clicking hidden inputs, not labels styled as buttons.

    `.admin-filters` normalises the height of every `input`, `select`, `button`
    and `a` inside the row — deliberately not `label`, because the field labels
    above each control are labels and a 34px floor would wreck all sixteen
    filter bars. A label dressed as a button would therefore be the one control
    in the row sitting at a different height.

    `type="button"` because this is inside the filter `<form>`: the default is
    submit, so choosing a file would run the search instead.
  */
  const pick = (input: HTMLInputElement | null) => input?.click();

  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.currentTarget.files ?? []);
    // Cleared so choosing the same file twice fires `change` the second time.
    e.currentTarget.value = "";
    if (chosen.length) upload(chosen);
  };

  return (
    <div className="flex items-end gap-1.5">
      <Button type="button" size="sm" onClick={() => pick(files.current)} disabled={progress !== null}>
        Upload
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => pick(folder.current)}
        disabled={progress !== null}
        /*
          A folder upload is flattened, and the tooltip is where that is said
          now the panel's paragraph is gone. `webkitdirectory` hands over the
          whole tree, but this library's folders are a label on a row rather
          than a path — so the structure cannot be kept, and implying it could
          would be the lie.
        */
        title={`Every file inside a folder, including subfolders. The structure is not kept — this library files by label, not by path.${filed ? " They land in the folder you are looking at." : ""}`}
      >
        Folder…
      </Button>

      <input ref={files} type="file" multiple accept={ACCEPT} onChange={take} className="sr-only" tabIndex={-1} />
      <input
        ref={folder}
        type="file"
        multiple
        accept={ACCEPT}
        // Non-standard, unprefixed nowhere, implemented everywhere.
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={take}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}

/**
 * What an upload is doing, and nothing when it is doing nothing.
 *
 * Returning null while idle is the whole point: this sits between the filters
 * and the grid, and a permanently reserved status line is the panel's mistake
 * in miniature.
 */
export function UploadStatus() {
  const { progress, message } = useUpload();

  if (!progress && !message) return null;

  return (
    <div className="mb-3">
      {progress && <ProgressBar progress={progress} />}
      {message && (
        <p
          role={message.tone === "err" ? "alert" : "status"}
          className={cn(
            "text-[12.5px]",
            progress && "mt-1.5",
            message.tone === "err" ? "text-err" : "text-ok",
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
