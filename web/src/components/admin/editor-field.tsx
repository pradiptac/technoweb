"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Prose } from "@/components/ui/prose";
import { cn } from "@/lib/utils";

/**
 * The body field: a rich-text editor with a preview that renders through the
 * same Prose component the live site uses, so an editor sees the real result
 * rather than the editor's own approximation of it.
 *
 * ssr: false is required, not preference — Summernote and jQuery both touch
 * `document` when their modules are evaluated, which throws during server
 * rendering. It is also what keeps ~250KB of editor out of the bundle of every
 * console screen that has no body field.
 */
const RichTextEditor = dynamic(
  () => import("./rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[320px] rounded border border-line-strong bg-card p-4 text-15 text-muted">
        Loading editor…
      </div>
    ),
  },
);

export function EditorField({
  name, label = "Body", defaultValue = "", error, hint, onChange,
}: {
  name: string;
  /** Solutions call this field "Overview"; most entities call it "Body". */
  label?: string;
  defaultValue?: string;
  error?: string;
  /** One line under the label, for a field whose rules differ from a body's. */
  hint?: ReactNode;
  /** Told of every change, for a caller drawing a live preview beside the editor. */
  onChange?: (html: string) => void;
}) {
  const [html, setHtml] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  const hidden = useRef<HTMLInputElement>(null);
  /*
    Bumped when `FormDraft` puts a draft back. The draft lands in the hidden
    input below like any other control, which nothing in Summernote watches,
    so the editor is re-keyed and mounts again on the restored markup.
    Read from the DOM before React's own render overwrites it — the event is
    dispatched inside the click that restored everything, so nothing has
    rendered yet.
  */
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const form = hidden.current?.closest("form");
    if (!form) return;
    const restored = () => {
      const value = hidden.current?.value;
      if (value === undefined || value === html) return;
      setHtml(value);
      setEpoch((e) => e + 1);
    };
    form.addEventListener("tw:draft-restored", restored);
    return () => form.removeEventListener("tw:draft-restored", restored);
  }, [html]);

  return (
    <div className="mb-[18px]">
      <div className="mb-[7px] flex items-center justify-between gap-3">
        <span className="text-13-5 font-semibold">
          {label}
          {hint && <span className="mt-0.5 block text-12 font-normal text-muted">{hint}</span>}
        </span>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className={cn(
            "rounded border px-3 py-1.5 text-12-5 font-semibold transition-colors",
            preview
              ? "border-brand-600 bg-brand-600 text-brand-on"
              : "border-line-strong bg-card text-muted hover:border-faint hover:text-ink",
          )}
          aria-pressed={preview}
        >
          {preview ? "Back to editing" : "Preview"}
        </button>
      </div>

      {/* The value the form actually submits. Kept in sync with the editor so
          the field works exactly like any other input in the form. */}
      <input ref={hidden} type="hidden" name={name} value={html} />

      {preview ? (
        <div className="min-h-[320px] rounded border border-line-strong bg-card p-6">
          {html.trim()
            ? <Prose html={html} />
            : <p className="text-14 text-muted">Nothing to preview yet.</p>}
        </div>
      ) : (
        <RichTextEditor key={epoch} value={epoch ? html : defaultValue} onChange={(v) => { setHtml(v); onChange?.(v); }} />
      )}

      {error && <p className="mt-1.5 text-12-5 text-err">{error}</p>}
    </div>
  );
}
