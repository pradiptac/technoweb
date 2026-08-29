"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
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
      <div className="min-h-[320px] rounded border border-line-strong bg-card p-4 text-[15px] text-muted">
        Loading editor…
      </div>
    ),
  },
);

export function EditorField({
  name, label = "Body", defaultValue = "", error,
}: {
  name: string;
  /** Solutions call this field "Overview"; most entities call it "Body". */
  label?: string;
  defaultValue?: string;
  error?: string;
}) {
  const [html, setHtml] = useState(defaultValue);
  const [preview, setPreview] = useState(false);

  return (
    <div className="mb-[18px]">
      <div className="mb-[7px] flex items-center justify-between gap-3">
        <span className="text-[13.5px] font-semibold">{label}</span>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className={cn(
            "rounded border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
            preview
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-line-strong bg-card text-muted hover:border-faint hover:text-ink",
          )}
          aria-pressed={preview}
        >
          {preview ? "Back to editing" : "Preview"}
        </button>
      </div>

      {/* The value the form actually submits. Kept in sync with the editor so
          the field works exactly like any other input in the form. */}
      <input type="hidden" name={name} value={html} />

      {preview ? (
        <div className="min-h-[320px] rounded border border-line-strong bg-card p-6">
          {html.trim()
            ? <Prose html={html} />
            : <p className="text-[14px] text-muted">Nothing to preview yet.</p>}
        </div>
      ) : (
        <RichTextEditor value={defaultValue} onChange={setHtml} />
      )}

      {error && <p className="mt-1.5 text-[12.5px] text-err">{error}</p>}
    </div>
  );
}
