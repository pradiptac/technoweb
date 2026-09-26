"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Period = "monthly" | "yearly";

/**
 * The interactive half of a pricing block: the set tabs and the billing
 * toggle. The plans themselves are rendered by the server and handed in as
 * `panels`, so this island carries two pieces of state and no markup that
 * could have been static.
 *
 * The billing period is a `data-billing` attribute on the wrapper, not a
 * prop threaded through every price: each price is rendered twice by the
 * server (`data-period="monthly"` / `"yearly"`) and `blocks.css` hides the
 * one not chosen. Without JavaScript the monthly figures show, which is also
 * what the server paints first.
 *
 * Tabs follow the ARIA pattern: one tab stop, arrow keys, Home and End, and
 * every panel stays mounted behind `hidden` so nothing inside one is lost.
 */
export function PricingSwitch({
  labels, billing, panels,
}: {
  labels: string[];
  billing: { monthly: string; yearly: string; note?: string | null } | null;
  panels: ReactNode[];
}) {
  const base = useId();
  const [active, setActive] = useState(0);
  const [period, setPeriod] = useState<Period>("monthly");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const withTabs = labels.length > 1;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const n = labels.length;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (active + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (active - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="blk-pricing" data-billing={period}>
      {(withTabs || billing) && (
        <div className="mb-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
          {withTabs && (
            <div role="tablist" aria-label="Plans" className="flex max-w-full flex-wrap justify-center gap-1 rounded-full border border-line-strong bg-surface-2 p-1">
              {labels.map((label, i) => {
                const selected = i === active;
                return (
                  <button
                    key={`${label}-${i}`}
                    ref={(el) => { tabs.current[i] = el; }}
                    type="button"
                    role="tab"
                    id={`${base}-tab-${i}`}
                    aria-selected={selected}
                    aria-controls={`${base}-panel-${i}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActive(i)}
                    onKeyDown={onKey}
                    className={cn(
                      "min-h-9 rounded-full px-4 py-1.5 text-14 font-semibold transition-colors duration-(--duration-base) ease-brand",
                      selected ? "bg-brand-600 text-brand-on shadow-1" : "text-muted hover:bg-card hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {billing && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <div role="group" aria-label="Billing period" className="flex gap-1 rounded-full border border-line-strong bg-card p-1">
                {(["monthly", "yearly"] as const).map((p) => {
                  const selected = p === period;
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPeriod(p)}
                      className={cn(
                        "min-h-9 rounded-full px-4 py-1.5 text-14 font-semibold transition-colors duration-(--duration-base) ease-brand",
                        selected ? "bg-ink text-page" : "text-muted hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      {p === "monthly" ? billing.monthly : billing.yearly}
                    </button>
                  );
                })}
              </div>
              {billing.note && <span className="text-13 font-semibold text-accent-ink">{billing.note}</span>}
            </div>
          )}
        </div>
      )}

      {panels.map((panel, i) => (
        withTabs ? (
          <div
            key={i}
            role="tabpanel"
            id={`${base}-panel-${i}`}
            aria-labelledby={`${base}-tab-${i}`}
            hidden={i !== active}
          >
            {panel}
          </div>
        ) : (
          <div key={i}>{panel}</div>
        )
      ))}
    </div>
  );
}
