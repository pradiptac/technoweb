"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A countdown to `endsAt`, and what happens when it runs out.
 *
 * **Client-only first render**, the `DueClock` rule in
 * `components/portal/ticket-live.tsx`: the server does not know the
 * visitor's clock to the second, so the digits start as dashes and fill in
 * after mount — a server-rendered "02:13:45" is a hydration mismatch a
 * second later. `children` is the banner itself; once the time is up it is
 * hidden (`expired: hide`) or replaced by the editor's message.
 */
export function CtaCountdown({ endsAt, expired, expiredMessage, children }: {
  endsAt: string;
  expired: "hide" | "message";
  expiredMessage?: string | null;
  children: ReactNode;
}) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(endsAt).getTime();
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (left === 0) {
    if (expired === "hide" || !expiredMessage) return null;
    return <p className="rounded-lg bg-card p-5 text-center text-14-5 text-ink">{expiredMessage}</p>;
  }

  const parts = left === null ? null : {
    days: Math.floor(left / 86_400_000),
    hours: Math.floor(left / 3_600_000) % 24,
    minutes: Math.floor(left / 60_000) % 60,
    seconds: Math.floor(left / 1000) % 60,
  };
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <>
      {children}
      <ul className="mt-6 flex justify-center gap-2 sm:gap-3" aria-label="Time left">
        {(["days", "hours", "minutes", "seconds"] as const).map((unit) => (
          <li key={unit} className="min-w-16 rounded-lg bg-card px-3 py-2.5 text-center text-ink">
            <span className="block font-mono text-22 font-semibold tabular-nums">{parts ? pad(parts[unit]) : "--"}</span>
            <span className="block text-12 text-muted capitalize">{unit}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
