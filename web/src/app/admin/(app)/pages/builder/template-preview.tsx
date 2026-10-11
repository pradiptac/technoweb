"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { previewLibraryAction } from "../library-actions";

/**
 * A page template (or a library section) drawn by the public site's own
 * components under the active theme (0.162.0) — the unsaved-preview frame,
 * `/admin/draft-preview/{id}`, fed by `previewLibraryAction`. Controlled: the
 * caller names the item to show and closes it. Nothing is written.
 */
export function TemplatePreview({ item, onClose }: { item: { id: number; name: string } | null; onClose: () => void }) {
  // Keyed on the item, so a second one starts from a blank frame rather than the first one's.
  return <PreviewFrame key={item?.id ?? "none"} item={item} onClose={onClose} />;
}

function PreviewFrame({ item, onClose }: { item: { id: number; name: string } | null; onClose: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = item?.id ?? null;

  useEffect(() => {
    if (id === null) return;
    let live = true;
    previewLibraryAction(id).then((result) => {
      if (!live) return;
      if (result.draft) setDraft(result.draft);
      else setError(result.error ?? "The preview could not be drawn.");
    });
    return () => { live = false; };
  }, [id]);

  return (
    <Modal open={item !== null} onClose={onClose} size="xl" title={item ? `Preview — ${item.name}` : "Preview"}
      description="Drawn by the public site’s own sections, under the active theme. Nothing is applied.">
      {item && !draft && !error && <p className="py-10 text-center text-13-5 text-muted">Drawing the sections…</p>}
      {error && <Alert tone="err" title="Nothing to show" dismissible={false}>{error}</Alert>}
      {draft && (
        <iframe
          src={`/admin/draft-preview/${draft}`}
          title={`Preview of ${item?.name ?? "the template"}`}
          className="block h-[70vh] w-full rounded border border-line bg-page"
        />
      )}
    </Modal>
  );
}
