"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { writingStatusAction } from "@/app/admin/(app)/writing-actions";
import { IconSparkle } from "@/components/icons-ui";
import type { WritingModeKey, WritingStatus, WritingSurface } from "@/types/writing";
import { WritingPanel } from "./writing-panel";

// One call per page load, shared by every button on the screen.
let pending: Promise<WritingStatus | null> | null = null;

/** The status, once loaded and only while writing help is available; null otherwise. */
export function useWritingStatus(): WritingStatus | null {
  const [status, setStatus] = useState<WritingStatus | null>(null);

  useEffect(() => {
    pending ??= writingStatusAction().catch(() => null);
    let live = true;
    void pending.then((s) => {
      if (!s) pending = null; // a failed read is retried by the next mount
      if (live) setStatus(s?.available ? s : null);
    });
    return () => {
      live = false;
    };
  }, []);

  return status;
}

export function AiWriteButton({
  label, surface, ref_, getInput, onApply, html, max, modes, format,
}: {
  label?: string;
  surface: WritingSurface;
  ref_: Record<string, unknown>;
  getInput: () => string;
  onApply: (output: string, how: "replace" | "below") => void;
  html?: boolean;
  max?: number;
  modes?: WritingModeKey[];
  format?: (output: string) => string;
}) {
  const status = useWritingStatus();
  const [open, setOpen] = useState(false);

  if (!status) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ?? "Writing help"}
        title={label ?? "Writing help"}
        className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-brand-ink hover:bg-surface-2"
      >
        <IconSparkle className="size-4" />
      </button>
      {/* In the body: a button often sits in a field's hint (a paragraph), and a dialog's heading is not allowed there. */}
      {createPortal(
      <WritingPanel
        open={open}
        onClose={() => setOpen(false)}
        surface={surface}
        ref_={ref_}
        getInput={getInput}
        html={html}
        max={max}
        modes={modes}
        draftLabel={surface === "ticket_reply" ? label : undefined}
        status={status}
        onApply={onApply}
        format={format}
      />,
      document.body,
      )}
    </>
  );
}
