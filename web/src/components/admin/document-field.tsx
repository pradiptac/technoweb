"use client";

import { useState } from "react";
import { MediaBrowser } from "@/components/admin/media-browser";
import { Button } from "@/components/ui/button";

/**
 * A document chosen from the media library, stored as a path.
 *
 * The path, not a URL and not an id, matching every other file reference in the
 * application: records store a path, and a stored path with `?v=` on it is a
 * filename that does not exist. The API refuses a path the library does not
 * know, so this cannot be used to point at a file nobody uploaded — an
 * attachment that silently fails to attach is a message claiming a document the
 * customer never receives.
 *
 * The hidden input carries the value, so this works inside the one big `<form>`
 * every CMS screen here is, and an empty string clears it.
 */
export function DocumentField({
  name, label, hint, defaultPath, defaultName, error,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultPath?: string | null;
  /** The human filename, so the field shows what a reader will receive. */
  defaultName?: string | null;
  error?: string;
}) {
  const [path, setPath] = useState(defaultPath ?? "");
  const [filename, setFilename] = useState(defaultName ?? "");
  const [browsing, setBrowsing] = useState(false);

  return (
    <div className="mb-[18px]">
      <label className="mb-1 block text-[13px] font-semibold">{label}</label>

      <input type="hidden" name={name} value={path} />

      <div className="flex flex-wrap items-center gap-2">
        {path ? (
          <span className="flex min-w-0 items-center gap-2 rounded-md border border-line-strong bg-surface-2 px-3 py-1.5">
            {/* `min-w-0` and `truncate`: a hashed filename is one unbreakable
                run, and a flex item's min-content is otherwise its full width —
                the trap the campaign block list documents. */}
            <span className="min-w-0 truncate text-[12.5px]">{filename || path}</span>
          </span>
        ) : (
          <span className="text-[12.5px] text-muted">No document chosen.</span>
        )}

        <Button type="button" variant="secondary" onClick={() => setBrowsing(true)}>
          {path ? "Change" : "Choose a document"}
        </Button>

        {path && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => { setPath(""); setFilename(""); }}
          >
            Remove
          </Button>
        )}
      </div>

      {hint && !error && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
      {error && <p className="mt-1 text-[12px] text-err">{error}</p>}

      <MediaBrowser
        open={browsing}
        kind="file"
        title="Choose a document"
        accept="application/pdf"
        onClose={() => setBrowsing(false)}
        onPick={(file) => {
          setPath(file.path);
          setFilename(file.name);
          setBrowsing(false);
        }}
      />
    </div>
  );
}
