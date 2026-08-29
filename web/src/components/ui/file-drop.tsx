"use client";

import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The upload control, used everywhere this product accepts a file.
 *
 * Before this there were three different ones: a bare `FileInput` on the
 * ticket forms and the careers form, a `FileInput` plus a separate invisible
 * drop zone on the media library, and another `FileInput` inside each cover
 * and gallery picker. Dragging worked on exactly one screen, and nothing
 * anywhere said so — a drop target you cannot see is a feature only the person
 * who wrote it knows about.
 *
 * Two modes, and the difference is not cosmetic:
 *
 * - **`progress` given** — the caller uploads the files itself, as the media
 *   library and the cover picker do, and reports how far it has got.
 * - **`name` given** — the files ride along with the surrounding form, as
 *   ticket attachments and a CV do. There is no progress to show because
 *   nothing has been sent yet; the control lists what will go.
 *
 * A progress bar in the second case would be theatre, so it is not offered.
 */

export type UploadProgress = {
  /** Files finished. */
  done: number;
  /** Files in this batch. */
  total: number;
  /** Shown under the bar — usually the name of the file in flight. */
  label?: string;
};

export function FileDrop({
  accept, multiple = false, onFiles, name, progress = null, hint, disabled = false,
  label = multiple ? "Select files…" : "Select a file…", className, children,
  id, required = false, directory = false, "aria-describedby": describedBy,
}: {
  accept?: string;
  multiple?: boolean;
  /**
   * Told about the chosen files. Given for an uploader; omitted when the
   * files travel with the form instead.
   */
  onFiles?: (files: File[]) => void;
  /** Posts with the surrounding form under this name, e.g. `attachments`. */
  name?: string;
  progress?: UploadProgress | null;
  hint?: ReactNode;
  disabled?: boolean;
  label?: string;
  className?: string;
  /** Anything to render inside the zone, under the button. */
  children?: ReactNode;
  /**
   * Given when a `Field` wraps this, so its <label for> reaches the real
   * input. Without it the label points at a generated id and clicking it
   * does nothing — the control still works, and the label silently stops
   * being one.
   */
  id?: string;
  /**
   * Form mode only. The CV on the careers form is the one upload in the
   * product that must be present, and native validation is what says so
   * before the request is made rather than after.
   */
  required?: boolean;
  /**
   * Offer a **folder** instead of files.
   *
   * `webkitdirectory` is non-standard and unprefixed nowhere, but every
   * current browser implements it under that name — so it is set through a
   * cast rather than pretending React types it. It hands over every file in
   * the tree, recursively, which is why it is a separate control rather than
   * a flag on the existing one: "add these three" and "add everything under
   * here" are different intentions and one of them can be a thousand files.
   */
  directory?: boolean;
  /**
   * `Field` clones its child to add this, which is how a hint and a
   * validation message get associated with the control. An unforwarded
   * clone leaves both as text a screen reader never connects to the field.
   */
  "aria-describedby"?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [chosen, setChosen] = useState<File[]>([]);

  /*
    Drag enter and leave fire again for every child element crossed, so a naive
    boolean flickers off the moment the pointer moves over the button inside
    the zone. Counting depth is the standard fix and the one the media
    library's own drop zone already used.
  */
  const depth = useRef(0);

  const busy = progress !== null;

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;

    if (onFiles) {
      onFiles(files);
      // Cleared so the same file can be picked again after a failure —
      // otherwise `change` does not fire for an identical selection.
      if (input.current) input.current.value = "";
    } else {
      // Form mode: the input keeps the files, because it is what posts them.
      setChosen(files);
    }
  };

  return (
    <div className={className}>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current += 1;
          setOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          depth.current -= 1;
          if (depth.current <= 0) { depth.current = 0; setOver(false); }
        }}
        /*
          Without preventDefault on dragover the browser handles the drop
          itself: it opens the file and navigates away from the console,
          losing whatever was half-typed on the page.
        */
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          /*
            **Not** `stopPropagation`, and that was a real bug.

            This panel can sit inside a larger drop target — the media library
            keeps a whole-grid one as well — so the drop has to reach the
            parent even though this handles it. Stopping it meant the parent's
            "Drop to upload" overlay never got the event that clears it, so it
            stayed over the grid until the page was reloaded. The upload
            worked; the screen looked broken, which is worse than either.

            The double-upload it was there to prevent is handled the other way
            round instead: the zone is marked `data-filedrop`, and an outer
            target skips a drop that landed inside one while still resetting
            its own overlay.
          */
          depth.current = 0;
          setOver(false);
          if (disabled || busy) return;

          if (name && input.current) {
            /*
              Form mode has to put the dropped files *into* the input, or they
              are not what gets posted. `DataTransfer` is the only way to build
              a FileList, and assigning `.files` is the only way to set one.
            */
            const dt = new DataTransfer();
            for (const f of Array.from(e.dataTransfer.files)) dt.items.add(f);
            input.current.files = dt.files;
          }
          take(e.dataTransfer.files);
        }}
        /*
          The marker an enclosing drop target checks, so it can leave the file
          to this one and still clear its own overlay. See the drop handler.
        */
        data-filedrop=""
        className={cn(
          "rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          over && !disabled && !busy
            ? "border-brand-600 bg-brand-50"
            : "border-line-strong bg-surface",
          disabled && "opacity-60",
        )}
      >
        {/*
          A real file input, visually hidden rather than replaced by a button
          that calls `.click()`. It keeps its own keyboard behaviour, it is what
          a screen reader announces, and in form mode it is the thing that
          actually posts. The <label> is the visible control.
        */}
        <input
          ref={input}
          id={inputId}
          type="file"
          name={name}
          accept={accept}
          multiple={multiple}
          // React has no prop for it; the DOM attribute is what browsers read.
          {...(directory ? { webkitdirectory: "" } : {})}
          disabled={disabled || busy}
          required={required}
          aria-describedby={describedBy}
          onChange={(e) => take(e.currentTarget.files)}
          className="sr-only"
        />

        <label
          htmlFor={inputId}
          className={cn(
            "inline-block rounded border border-line-strong bg-card px-4 py-2 text-[13.5px] font-semibold",
            "transition-colors",
            disabled || busy
              ? "cursor-not-allowed text-faint"
              : "cursor-pointer text-brand-ink hover:border-brand-600 hover:bg-brand-50",
          )}
        >
          {label}
        </label>

        <p className="mt-2 text-[12.5px] text-muted">
          {busy ? "Uploading…" : "or drag them here"}
        </p>

        {hint && <p className="mt-1 text-[12.5px] text-faint">{hint}</p>}

        {children}

        {/* Form mode: say what will be sent. Nothing has been uploaded yet, so
            this is a list rather than a result. */}
        {!busy && chosen.length > 0 && (
          <ul className="mx-auto mt-3 max-w-[46ch] space-y-1 text-left">
            {chosen.map((f) => (
              <li
                key={`${f.name}-${f.size}`}
                className="flex items-center justify-between gap-3 rounded border border-line bg-card px-2.5 py-1.5 text-[12.5px]"
              >
                <span className="min-w-0 truncate" title={f.name}>{f.name}</span>
                <span className="shrink-0 text-faint tabular-nums">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {busy && <ProgressBar progress={progress} />}
    </div>
  );
}

/**
 * Progress measured in **files**, not bytes, and the label says so.
 *
 * Byte-level progress needs `XMLHttpRequest.upload.onprogress`, and every
 * upload here goes through a Server Action — which gives no progress events at
 * all. The options were an honest per-file count or a percentage animated on a
 * timer, and a fake bar is worse than none: it is the one part of an upload
 * people watch to decide whether something has hung.
 *
 * So the bar fills by completed files and the segment for the file in flight
 * is striped and animated, which is what actually distinguishes "working" from
 * "stuck". If byte progress is ever wanted, it needs a route handler that
 * proxies the multipart body so XHR can watch it.
 */
function ProgressBar({ progress }: { progress: UploadProgress }) {
  const { done, total, label } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="font-medium tabular-nums">
          {total > 1 ? `${pct}% — ${done} of ${total} files` : "Uploading…"}
        </span>
        {label && <span className="min-w-0 truncate text-faint" title={label}>{label}</span>}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        // Omitted while a single file is in flight: there is genuinely no
        // measurement, and an indeterminate bar is what that means.
        aria-valuenow={total > 1 ? done : undefined}
        aria-label="Upload progress"
        className="h-2 overflow-hidden rounded-full bg-muted/25"
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
          style={{ width: total > 1 ? `${pct}%` : "100%" }}
        >
          {/* The in-flight stripe. On a single file it covers the whole bar,
              which is the honest rendering of "something is happening and
              there is nothing to measure". */}
          <span className="upload-stripe block h-full w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
