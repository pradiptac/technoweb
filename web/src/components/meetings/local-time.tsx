"use client";

import { useSyncExternalStore } from "react";

/**
 * "(11:00 your time)" — the one time on the meetings pages drawn by the
 * browser rather than by the API (docs/meetings-contract.md, "Times").
 *
 * Every label on the page is the API's, in the business's timezone, and says
 * so. A visitor in another zone gets this beside it; one in the same zone
 * gets nothing, because repeating the same time would only make them wonder
 * why. The browser's zone is read through `useSyncExternalStore` with a null
 * server snapshot — the server has no idea where the visitor is, so the
 * prerendered page never guesses, and hydration adds the line afterwards.
 */
const noop = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
const serverZone = () => null;

export function useBrowserZone(): string | null {
  return useSyncExternalStore(noop, browserZone, serverZone);
}

/** True when the visitor's zone differs from the business's (by offset at that moment, not by name). */
export function differsFrom(zone: string | null, business: string, at: string): boolean {
  if (!zone || zone === business) return false;
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return false;
  const fmt = (timeZone: string) =>
    new Intl.DateTimeFormat("en-IN", { timeZone, hour: "2-digit", minute: "2-digit", day: "2-digit", hourCycle: "h23" }).format(when);
  try {
    return fmt(zone) !== fmt(business);
  } catch {
    return false;
  }
}

export function LocalTime({ start, timezone, className }: { start: string; timezone: string; className?: string }) {
  const zone = useBrowserZone();
  if (!zone || !differsFrom(zone, timezone, start)) return null;

  const when = new Date(start);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(when);
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(when)
    === new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(when);
  const day = sameDay ? "" : `${new Intl.DateTimeFormat("en-IN", { timeZone: zone, weekday: "short", day: "numeric", month: "short" }).format(when)}, `;

  return <span className={className}> ({day}{time} your time)</span>;
}

/**
 * The line above a list of times, when the visitor is elsewhere: the times
 * below are the business's, and here is where you appear to be.
 */
export function ZoneNote({ timezone, label, sample }: { timezone: string; label: string; sample: string }) {
  const zone = useBrowserZone();
  if (!zone || !differsFrom(zone, timezone, sample)) return null;

  return (
    <p className="mb-2 text-13 text-muted">
      Times are shown in {label}. Your device is set to {zone.replace(/_/g, " ")} — we show your own time beside the one you choose.
    </p>
  );
}
