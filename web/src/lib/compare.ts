"use client";

import { useSyncExternalStore } from "react";
import { COMPARE_MAX } from "@/lib/compare-max";

export { COMPARE_MAX };

/**
 * The compare tray's contents: up to four catalogue products, as
 * `{slug, name}` pairs in `sessionStorage`.
 *
 * Session, not local: a comparison is a thing somebody is doing now, and a
 * tray that reappears next week holding three switches they bought in the
 * meantime is a mystery rather than a convenience. The slug is what the
 * compare page fetches by (`/products/{slug}`, ISR-cached like the product
 * page itself); the name is kept beside it so the tray can say what it holds
 * without a fetch. Four, not three: a hardware buyer routinely has two
 * candidates and two alternatives, and a fifth column does not fit a laptop.
 *
 * Read through `useSyncExternalStore` with an empty server snapshot, so the
 * server renders no tray and no ticked cards — the rule `lib/consent.ts`
 * sets for anything that lives in a browser store.
 */
export type CompareItem = { slug: string; name: string };

const KEY = "tw_compare";
const EMPTY: CompareItem[] = [];

let cached: CompareItem[] | null = null;
const listeners = new Set<() => void>();

function read(): CompareItem[] {
  if (cached) return cached;
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CompareItem[]) : [];
    cached = Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.slug === "string" && typeof i.name === "string").slice(0, COMPARE_MAX) : [];
  } catch {
    cached = [];
  }
  return cached;
}

function write(next: CompareItem[]) {
  cached = next;
  try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* per-tab only */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useCompare(): CompareItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Adds or removes one. Returns false when the tray is full and nothing changed. */
export function toggleCompare(item: CompareItem): boolean {
  const current = read();
  if (current.some((i) => i.slug === item.slug)) {
    write(current.filter((i) => i.slug !== item.slug));
    return true;
  }
  if (current.length >= COMPARE_MAX) return false;
  write([...current, item]);
  return true;
}

export function clearCompare() { write([]); }

/** The compare page's URL for what is in the tray. */
export function compareHref(items: CompareItem[]): string {
  return `/products/compare?p=${items.map((i) => encodeURIComponent(i.slug)).join(",")}`;
}
