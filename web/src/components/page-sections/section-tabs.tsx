"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent } from "react";
import { focalStyle } from "@/lib/focal";
import { cn } from "@/lib/utils";
import type { TabItem } from "@/types/api";

/**
 * The tabs of a builder `tabs` section (0.107.0): the WAI-ARIA tabs pattern —
 * one tab stop, arrows/Home/End move and select, every panel rendered by the
 * server and the inactive ones `hidden`, so a crawler and a reader without
 * scripts get every word.
 *
 * The tab strip **wraps** rather than scrolling sideways: eight short labels
 * fit two lines on a phone, and a strip that scrolls hides the very labels it
 * exists to show. A panel with a picture is words and picture side by side
 * from `lg`, the picture a fixed 4:3 so changing tab never changes the
 * picture's shape. From `xl` the words take seven parts to the picture's five,
 * so on a wide screen the picture does not grow into a billboard beside a
 * short paragraph; the words always keep a reading measure.
 */
export function SectionTabs({ id, items, titled }: { id: string; items: TabItem[]; titled: boolean }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const key = (e: KeyboardEvent) => {
    const last = items.length - 1;
    const next = e.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : e.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
        : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div data-section-tabs>
      <div role="tablist" aria-orientation="horizontal" onKeyDown={key} className="flex flex-wrap gap-2 border-b border-line pb-4">
        {items.map((t, i) => (
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
              "min-h-10 rounded-full border px-4 text-14 font-semibold transition-colors duration-(--duration-base)",
              i === active
                ? "border-brand-600 bg-brand-600 text-brand-on"
                : "border-line-strong bg-(--color-card) text-ink-2 hover:border-brand-ink/50 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items.map((t, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={i !== active}
          tabIndex={0}
          className="settle-in pt-8"
        >
          <div className={cn("grid items-center gap-10", t.image && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:gap-20")}>
            <div className={cn("min-w-0 max-w-3xl")}>
              {t.heading && (titled
                ? <h3 className="display-3 text-balance">{t.heading}</h3>
                : <p className="display-3 text-balance">{t.heading}</p>)}
              {t.body.split(/\n\s*\n/).map((para, n) => (
                <p key={n} className={cn("text-base leading-[1.7] text-ink-2 whitespace-pre-line", (n > 0 || t.heading) && "mt-4")}>{para}</p>
              ))}
            </div>
            {t.image && (
              <div className="relative aspect-[4/3] w-full max-w-2xl min-w-0 overflow-hidden rounded-xl border border-line-strong bg-surface-2 lg:max-w-none xl:aspect-[16/10]">
                <Image
                  src={t.image}
                  alt={t.image_alt ?? ""}
                  fill
                  sizes="(min-width: 1024px) 45vw, 90vw"
                  className="object-cover"
                  style={focalStyle(t.image_focus)}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
