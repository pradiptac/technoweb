"use client";

import { useSyncExternalStore } from "react";

/**
 * Days, hours, minutes and seconds to an instant (the countdown section,
 * 0.111.0).
 *
 * The clock is read through `useSyncExternalStore`, whose server snapshot is
 * null: the server and the first client render draw the boxes empty, so
 * nothing about the visitor's clock can mismatch the hydration, and the
 * figures arrive on the next frame. The ticking boxes are hidden from a
 * screen reader, which is told the end date once, in words, under them.
 */
const subscribe = (tick: () => void) => {
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
};
const now = () => Math.floor(Date.now() / 1000);
const never = () => null;

const UNITS = [
  { key: "days", label: "Days", seconds: 86400 },
  { key: "hours", label: "Hours", seconds: 3600 },
  { key: "minutes", label: "Minutes", seconds: 60 },
  { key: "seconds", label: "Seconds", seconds: 1 },
] as const;

export function Countdown({ endsAt, endsLabel, doneText }: { endsAt: string; endsLabel?: string; doneText?: string }) {
  const at = useSyncExternalStore(subscribe, now, never);
  const end = Math.floor(new Date(endsAt).getTime() / 1000);
  const left = at === null ? null : Math.max(0, end - at);

  if (left === 0) {
    return <p className="text-17 font-semibold text-ink">{doneText || "This has ended."}</p>;
  }

  // Each unit is what is left over after the larger ones.
  const total = left ?? 0;
  const parts = UNITS.map((u, i) => {
    const above = i === 0 ? Infinity : UNITS[i - 1].seconds;
    return { ...u, value: Math.floor((total % above) / u.seconds) };
  });

  return (
    <div>
      <div aria-hidden className="mx-auto grid max-w-2xl grid-cols-4 gap-2 sm:gap-4">
        {parts.map((p) => (
          <div key={p.key} data-countdown-unit className="rounded-lg border border-line-strong bg-card px-1 py-4 text-center sm:py-6">
            <span className="block font-display text-[clamp(28px,6vw,56px)] font-bold leading-none tabular-nums text-ink">
              {left === null ? "–" : String(p.value).padStart(p.key === "days" ? 1 : 2, "0")}
            </span>
            <span className="mt-2 block text-12 font-semibold uppercase tracking-[.1em] text-muted">{p.label}</span>
          </div>
        ))}
      </div>
      {endsLabel && <p className="mt-4 text-14 text-muted">Ends {endsLabel}</p>}
    </div>
  );
}
