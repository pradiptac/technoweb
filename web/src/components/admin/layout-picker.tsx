"use client";

import { Modal } from "@/components/ui/modal";

/**
 * The eight layouts the editor can insert, as a picker rather than a menu.
 *
 * Each option draws itself: a small diagram of blocks in the arrangement the
 * option produces, which answers "what does this one do" without reading —
 * eight names alone ("Alternating, image first") read as near-identical, and
 * the difference between them is entirely spatial.
 *
 * A real `<dialog>` through `Modal`, so focus is trapped, Escape closes it and
 * the rest of the document goes inert — the same reasons `modal.tsx` gives,
 * and the same component the media browser beside it uses.
 */
export type LayoutOption = { label: string; html: string; rows: ("left" | "right" | "stack" | "text")[] };

export function LayoutPicker({
  open, options, onClose, onPick,
}: {
  open: boolean;
  options: LayoutOption[];
  onClose: () => void;
  onPick: (html: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Insert a layout">
      <p className="measure mb-4 text-[13px] text-muted">
        Each one drops in a placeholder image and some sample text for you to
        replace. On a phone the two columns stack.
      </p>

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {options.map((option) => (
          <li key={option.label}>
            <button
              type="button"
              onClick={() => onPick(option.html)}
              className="flex w-full items-center gap-3 rounded-lg border border-line-strong bg-card p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <Diagram rows={option.rows} />
              <span className="min-w-0 text-[13px] font-medium">{option.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/**
 * The little picture of the arrangement.
 *
 * `aria-hidden`, because the label beside it already says what this is — a
 * screen reader reading out eight decorative block diagrams would be eight
 * announcements of nothing.
 */
function Diagram({ rows }: { rows: LayoutOption["rows"] }) {
  return (
    <span
      aria-hidden
      className="grid w-14 shrink-0 gap-[3px] rounded border border-line bg-surface-2 p-1.5"
    >
      {rows.slice(0, 3).map((row, i) => {
        if (row === "text") {
          return (
            <span key={i} className="grid gap-[3px]">
              <span className="block h-1.5 w-2/3 rounded-[2px] bg-brand-400" />
              <span className="block h-1 rounded-[2px] bg-line-strong" />
            </span>
          );
        }

        if (row === "stack") {
          return (
            <span key={i} className="grid gap-[3px]">
              <span className="block h-3 rounded-[2px] bg-brand-300" />
              <span className="block h-1 rounded-[2px] bg-line-strong" />
            </span>
          );
        }

        return (
          <span key={i} className="flex gap-[3px]">
            {row === "left" && <span className="block h-3 w-1/2 rounded-[2px] bg-brand-300" />}
            <span className="grid flex-1 content-center gap-[2px]">
              <span className="block h-1 rounded-[2px] bg-line-strong" />
              <span className="block h-1 w-3/4 rounded-[2px] bg-line-strong" />
            </span>
            {row === "right" && <span className="block h-3 w-1/2 rounded-[2px] bg-brand-300" />}
          </span>
        );
      })}
    </span>
  );
}
