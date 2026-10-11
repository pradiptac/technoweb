import { useSyncExternalStore } from "react";

/**
 * Two conveniences of one browser for the console (Console 2.0): whether
 * the sidebar is folded to its icon rail, and whether motion is Full or
 * Subtle. Both live in `localStorage` (the density rule, `lib/table-view.ts`)
 * and are stamped on `<html>` before paint by the root layout's script —
 * change the keys in both places together.
 *
 * No directive: the client components import the hooks; the root layout
 * spells the keys out for itself.
 */
export const NAV_KEY = "tw_console_nav";
export const MOTION_KEY = "tw_console_motion";

export type ConsoleNav = "full" | "rail";
export type ConsoleMotion = "full" | "subtle";

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changing the preference changes this one too.
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
const announce = () => listeners.forEach((l) => l());

function read(key: string, on: string): boolean {
  try { return localStorage.getItem(key) === on; } catch { return false; }
}

function write(key: string, on: string, value: boolean, attr: "consoleNav" | "consoleMotion") {
  try { if (value) localStorage.setItem(key, on); else localStorage.removeItem(key); } catch { /* the attribute still applies for this visit */ }
  if (value) document.documentElement.dataset[attr] = on; else delete document.documentElement.dataset[attr];
  announce();
}

export function useConsoleNav(): ConsoleNav {
  return useSyncExternalStore(subscribe, () => (read(NAV_KEY, "rail") ? "rail" : "full"), () => "full");
}
export function setConsoleNav(v: ConsoleNav) { write(NAV_KEY, "rail", v === "rail", "consoleNav"); }

export function useConsoleMotion(): ConsoleMotion {
  return useSyncExternalStore(subscribe, () => (read(MOTION_KEY, "subtle") ? "subtle" : "full"), () => "full");
}
export function setConsoleMotion(v: ConsoleMotion) { write(MOTION_KEY, "subtle", v === "subtle", "consoleMotion"); }
