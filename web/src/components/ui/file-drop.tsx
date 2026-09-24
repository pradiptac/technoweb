"use client";

import { formatBytes } from "@/lib/format-bytes";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IconClose } from "@/components/icons-ui";
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
 *   ticket attachments and a CV do. Until the form is submitted there is
 *   nothing to measure, so the control lists what will go; once it is, a
 *   form driven by `useUploadForm` passes `progress` here too and the same
 *   bar shows the bytes going out.
 *
 * A bar with nothing behind it would be theatre, so it is drawn only from a
 * measurement — a `progress` the caller can vouch for.
 *
 * Form mode keeps its own list of what will be sent (2026-09-21): a row per
 * file with a thumbnail for a picture, the name, the size and a remove
 * button. Three rules behind it. **Adding appends** — a pick, a drop and a
 * paste each join what is already chosen, where a drop used to replace the
 * pick before it. **Every file gets an id when it arrives**, because two
 * pasted screenshots are both `image.png` and a key built from the name and
 * the size collided. And **the hidden input is rebuilt from the list**, never
 * the other way round: `DataTransfer` is the only way to write a `FileList`,
 * so removing a row is building a new one without it.
 *
 * `paste` listens on the surrounding form rather than on this control, so
 * Ctrl+V into the reply's textarea lands the screenshot here without every
 * form wiring `onPaste`. Only `kind === "file"` items are taken and the
 * event is cancelled only when something was — pasting text still pastes
 * text. A clipboard image arrives as `image.png` from every browser, so it
 * is renamed to `pasted-<stamp>.png` on the way in: the thread would
 * otherwise list five identical names. That is the *file's* name, and the
 * rule in `docs/media.md` that a form-mode FileDrop renames nothing is about
 * the *field* (`attachments` → `attachments[]`), which stays the form's job.
 */

export type UploadProgress = {
  /** Files finished. */
  done: number;
  /** Files in this batch. */
  total: number;
  /** Shown under the bar — usually the name of the file in flight. */
  label?: string;
  /**
   * How much of the file in flight has been sent, 0–100, when the caller
   * uploads through `lib/upload-client.ts` and can say. Absent, the segment
   * for that file is an animated stripe rather than a number — a Server
   * Action upload cannot measure itself, and a fake percentage is worse than
   * an honest stripe.
   */
  percent?: number | null;
};

/** A chosen file in form mode, with the id its row is keyed on. */
type Chosen = { id: string; file: File };

let nextId = 0;
const chosenId = () => `f${++nextId}`;

/** The clipboard's `image.png`, named by the moment it was pasted. */
function pastedName(file: File): string {
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `pasted-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.${ext}`;
}

/** Whether a file matches an `accept` list of `.ext` and `type/*` entries; no list accepts everything. */
function accepted(file: File, accept?: string): boolean {
  if (!accept) return true;
  const ext = file.name.includes(".") ? `.${file.name.split(".").pop()!.toLowerCase()}` : "";
  return accept.split(",").map((s) => s.trim().toLowerCase()).some((rule) =>
    rule.startsWith(".") ? rule === ext
      : rule.endsWith("/*") ? file.type.startsWith(rule.slice(0, -1))
      : rule === file.type,
  );
}

export function FileDrop({
  accept, multiple = false, onFiles, name, progress = null, hint, disabled = false,
  label = multiple ? "Select files…" : "Select a file…", className, children,
  id, required = false, directory = false, "aria-describedby": describedBy,
  paste = false, max, maxBytes,
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
  /**
   * Form mode: take files pasted anywhere in the surrounding form — a
   * screenshot on the clipboard, Ctrl+V in the message box. See the docblock.
   */
  paste?: boolean;
  /**
   * Form mode: the most files the list may hold, and the largest one. Both
   * are the API's rules restated here so a refusal is a sentence under the
   * list rather than a 422 after the upload — the API's own limits stay the
   * rule (`AttachmentStore::MAX_FILES`, `support.attachment_max_kb`).
   */
  max?: number;
  maxBytes?: number;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [refused, setRefused] = useState<string | null>(null);

  /*
    Drag enter and leave fire again for every child element crossed, so a naive
    boolean flickers off the moment the pointer moves over the button inside
    the zone. Counting depth is the standard fix and the one the media
    library's own drop zone already used.
  */
  const depth = useRef(0);

  const busy = progress !== null;

  /*
    Form mode: the list is the truth and the hidden input is rebuilt from it,
    because `DataTransfer` is the one way to write a `FileList`. `list` is the
    same array as `chosen`, held in a ref so `add` and `remove` read the
    current one without a state updater — an updater with a side effect on
    the input runs twice under StrictMode.
  */
  const list = useRef<Chosen[]>([]);
  const commit = (next: Chosen[]) => {
    list.current = next;
    setChosen(next);
    if (!input.current) return;
    const dt = new DataTransfer();
    for (const c of next) dt.items.add(c.file);
    input.current.files = dt.files;
  };

  /*
    Add to what is chosen — never replace, whichever door the files came
    through. A single-file control (`multiple` off) keeps the newest, which
    is what picking again has always meant. The caps refuse with a sentence
    and take what fits.
  */
  const add = (files: File[]) => {
    if (!files.length) return;

    let next = multiple ? [...list.current] : [];
    const notes: string[] = [];

    for (const file of files) {
      if (maxBytes !== undefined && file.size > maxBytes) {
        notes.push(`${file.name} is over ${formatBytes(maxBytes)}.`);
        continue;
      }
      if (max !== undefined && next.length >= max) {
        notes.push(`Up to ${max} files.`);
        break;
      }
      next.push({ id: chosenId(), file });
    }

    if (!multiple) next = next.slice(-1);
    setRefused(notes.length ? Array.from(new Set(notes)).join(" ") : null);
    commit(next);
  };

  const remove = (id: string) => {
    setRefused(null);
    commit(list.current.filter((c) => c.id !== id));
  };

  const take = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (!picked.length) return;

    if (onFiles) {
      onFiles(picked);
      // Cleared so the same file can be picked again after a failure —
      // otherwise `change` does not fire for an identical selection.
      if (input.current) input.current.value = "";
    } else {
      add(picked);
    }
  };

  /*
    Form mode's two listeners on the surrounding form: `reset` empties the
    list (the portal reply resets its form after a send, and the rows used to
    stay behind), and `paste` — when asked for — takes the clipboard's files.
    Bound to the form so a paste into the textarea counts; the form is found
    from the input, which is inside it by construction.
  */
  useEffect(() => {
    const form = input.current?.form;
    if (!form || onFiles) return;

    const onReset = () => { list.current = []; setChosen([]); setRefused(null); };
    const onPaste = (e: ClipboardEvent) => {
      if (!paste || disabled || progress !== null) return;
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null)
        .filter((f) => accepted(f, accept))
        .map((f) => (/^image\.(png|jpe?g|gif|webp)$/i.test(f.name)
          ? new File([f], pastedName(f), { type: f.type, lastModified: f.lastModified })
          : f));
      if (!files.length) return;
      e.preventDefault();
      add(files);
    };

    form.addEventListener("reset", onReset);
    form.addEventListener("paste", onPaste);
    return () => {
      form.removeEventListener("reset", onReset);
      form.removeEventListener("paste", onPaste);
    };
    // `add` reads the caps through its closure; the listener is rebound when
    // anything it reads changes, and `progress` only as "busy or not".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paste, disabled, progress === null, accept, onFiles, multiple, max, maxBytes]);

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

          // Form mode puts the dropped files into the input through `add`,
          // which rebuilds it from the whole list — a drop joins a pick
          // rather than replacing it.
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
            "inline-block rounded border border-line-strong bg-card px-4 py-2 text-13-5 font-semibold",
            "transition-colors",
            disabled || busy
              ? "cursor-not-allowed text-faint"
              : "cursor-pointer text-brand-ink hover:border-brand-600 hover:bg-brand-50",
          )}
        >
          {label}
        </label>

        <p className="mt-2 text-12-5 text-muted">
          {busy ? "Uploading…" : "or drag them here"}
        </p>

        {hint && <p className="mt-1 text-12-5 text-faint">{hint}</p>}

        {children}

        {/* Form mode: say what will be sent. Nothing has been uploaded yet, so
            this is a list rather than a result — one row per file, a
            thumbnail where it is a picture, and a way to take one out. */}
        {!busy && chosen.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-left" aria-label="Files to send">
            {chosen.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded border border-line bg-card px-2.5 py-1.5 text-12-5"
              >
                <Thumb file={c.file} />
                <span className="min-w-0 flex-1 truncate" title={c.file.name}>{c.file.name}</span>
                <span className="shrink-0 text-faint tabular-nums">{formatBytes(c.file.size)}</span>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  aria-label={`Remove ${c.file.name}`}
                  title="Remove"
                  className="grid size-6 shrink-0 place-items-center rounded border border-line-strong bg-surface-2 text-muted transition-colors hover:border-err hover:text-err"
                >
                  <IconClose width={12} height={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {refused && <p className="mt-2 text-12-5 text-err" role="status">{refused}</p>}
      </div>

      {busy && <ProgressBar progress={progress} />}
    </div>
  );
}

/**
 * A 40px preview of a picture in the list, or a plain slot for anything
 * else so the names line up. The object URL is revoked when the row goes
 * — it holds the file's bytes in memory until it is.
 */
function Thumb({ file }: { file: File }) {
  const picture = file.type.startsWith("image/");
  const img = useRef<HTMLImageElement>(null);

  // The object URL is made and revoked in one effect and written straight
  // to the element: no state (the `set-state-in-effect` rule) and nothing
  // memoised across StrictMode's simulated unmount, which revoked a
  // memoised URL and left the second mount pointing at a dead blob.
  useEffect(() => {
    if (!picture || !img.current) return;
    const u = URL.createObjectURL(file);
    img.current.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file, picture]);

  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface-2">
      {picture
        // A preview of bytes still on this machine: `next/image` has nothing to optimise here.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img ref={img} alt="" className="size-full object-cover" />
        : <span className="text-10-5 font-semibold uppercase text-faint">{file.name.split(".").pop()?.slice(0, 4) || "file"}</span>}
    </span>
  );
}

/**
 * Progress in bytes when the caller can measure it, and in files when it
 * cannot — and the label says which.
 *
 * Byte-level progress needs `XMLHttpRequest.upload.onprogress`, which is what
 * `lib/upload-client.ts` provides and every console upload now goes through:
 * the bar fills as the file goes out and the figure beside it is a real
 * percentage. A caller still uploading through a Server Action gets no
 * progress events at all, and for that case the bar keeps its older honest
 * form — filled by completed files, with the segment for the file in flight
 * striped and animated, which is what distinguishes "working" from "stuck".
 * A percentage animated on a timer was the alternative, and a fake bar is
 * worse than none: it is the one part of an upload people watch to decide
 * whether something has hung.
 *
 * Once the last byte is out the server still has to store the file, run the
 * SVG sanitiser and answer — so a measured bar reads "Processing…" at 100
 * rather than sitting at a number that looks finished and is not.
 */
export function ProgressBar({ progress }: { progress: UploadProgress }) {
  const { done, total, label, percent } = progress;
  const measured = typeof percent === "number";
  // Overall progress: finished files plus the measured share of the current
  // one, so a batch of five reads 0 → 20 → … smoothly rather than in steps.
  const overall = total > 0
    ? Math.min(100, Math.round(((done + (measured ? percent / 100 : 0)) / total) * 100))
    : 0;
  const filesPct = total > 0 ? Math.round((done / total) * 100) : 0;

  let caption: string;
  if (measured) {
    const stage = percent >= 100 ? "Processing…" : `${percent}%`;
    caption = total > 1 ? `${stage} — file ${Math.min(done + 1, total)} of ${total}` : stage;
  } else {
    caption = total > 1 ? `${filesPct}% — ${done} of ${total} files` : "Uploading…";
  }

  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-12-5">
        <span className="font-medium tabular-nums" aria-live="polite">{caption}</span>
        {label && <span className="min-w-0 truncate text-faint" title={label}>{label}</span>}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        // Omitted only while a single file is in flight with nothing to
        // measure it: an indeterminate bar is what that means.
        aria-valuenow={measured || total > 1 ? overall : undefined}
        aria-label="Upload progress"
        className="h-2 overflow-hidden rounded-full bg-muted/25"
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-(--duration-base) ease-out"
          style={{ width: measured || total > 1 ? `${overall}%` : "100%" }}
        >
          {/* The in-flight stripe: on an unmeasured single file it covers the
              whole bar, and on a measured one it animates the filled part
              while the server is still processing. */}
          {(!measured || percent >= 100) && <span className="upload-stripe block h-full w-full rounded-full" />}
        </div>
      </div>
    </div>
  );
}
