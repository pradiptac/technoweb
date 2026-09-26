"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { StoredSection } from "@/types/api";
import { previewSectionsAction } from "./preview-action";

/**
 * "Preview" — the sections as they are typed right now, unsaved, drawn by
 * the public components under the active theme (`previewSectionsAction`).
 * A refusal names what to fix and marks the sections it is about, the way a
 * save's 422 does; nothing is written either way.
 */
export function PreviewDialog({ sections, pageId, onErrors }: {
  sections: StoredSection[];
  pageId: number | null;
  onErrors: (errors: Record<string, string[]> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [node, setNode] = useState<ReactNode>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setOpen(true);
    setNode(null);
    setError(null);
    start(async () => {
      const result = await previewSectionsAction(JSON.stringify(sections), pageId);
      if (result.node) {
        setNode(result.node);
        onErrors(null);
      } else {
        setError(result.error ?? "The preview could not be drawn.");
        onErrors(result.fieldErrors ?? null);
      }
    });
  };

  return (
    <>
      <Button type="button" variant="secondary" onClick={run} pending={pending} disabled={sections.length === 0}>
        Preview
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Preview — not saved" size="xl"
        description="Drawn by the public site’s own sections, under the active theme. Save to publish it.">
        {pending && <p className="py-10 text-center text-13-5 text-muted">Drawing the sections…</p>}
        {error && !pending && (
          <Alert tone="err" title="Nothing to show yet" dismissible={false}>
            {error} The sections that need attention are marked on the Builder tab.
          </Alert>
        )}
        {!pending && node}
      </Modal>
    </>
  );
}
