"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The tab strip of a layout `tabs` container (0.154.0): the WAI-ARIA tabs
 * pattern the builder's own `tabs` section uses — one tab stop, arrows/Home/End
 * move and select — with the panes rendered by the server and passed in. Every
 * pane is in the markup and the inactive ones are `hidden`, never unmounted, so
 * a crawler and a reader without scripts get every word and a form in a hidden
 * tab keeps what was typed.
 *
 * The strip wraps rather than scrolling sideways, so no label is ever hidden
 * off-screen, and a long label breaks instead of widening the row.
 */
export function ContainerTabs({ id, labels, panes }: { id: string; labels: string[]; panes: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const key = (e: KeyboardEvent) => {
    const last = labels.length - 1;
    const next = e.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : e.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
        : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div data-container-tabs className="min-w-0">
      <div role="tablist" aria-orientation="horizontal" onKeyDown={key} className="flex flex-wrap gap-2 border-b border-line pb-4">
        {labels.map((label, i) => (
          <button
            key={i}
            ref={(el) => { tabs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={cn(
              "min-h-10 max-w-full rounded-full border px-4 text-14 font-semibold [overflow-wrap:anywhere] transition-colors duration-(--duration-base)",
              i === active
                ? "border-brand-600 bg-brand-600 text-brand-on"
                : "border-line-strong bg-(--color-card) text-ink-2 hover:border-brand-ink/50 hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {panes.map((pane, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={i !== active}
          tabIndex={0}
          className="settle-in min-w-0 pt-6"
        >
          {pane}
        </div>
      ))}
    </div>
  );
}
