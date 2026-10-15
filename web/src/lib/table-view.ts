import { useSyncExternalStore } from "react";

/**
 * How one member of staff likes the console's list tables: how dense the rows
 * are, and which columns of each screen they have put away (0.119.0).
 *
 * Both are conveniences of a browser, not facts about the site, so they live
 * in `localStorage` and nowhere else — the scheme toggle's rule. Nothing here
 * reaches the API, and a screen that cannot read storage (a private window)
 * simply shows every column at the ordinary density.
 *
 * No directive: `table-view.tsx` is the client component, and the root
 * layout's blocking script spells the density key out for itself.
 */
export type Density = "comfortable" | "compact";

/** Read by the pre-paint script in `app/layout.tsx` — change both together. */
export const DENSITY_KEY = "tw_console_density";

const COLUMNS_PREFIX = "tw_table_cols:";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changing the preference changes this one too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function announce() {
  for (const listener of listeners) listener();
}

function readDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function useDensity(): Density {
  // The server cannot know; "comfortable" is what it renders, and the
  // attribute on <html> — set before paint — is what the rows actually obey.
  return useSyncExternalStore(subscribe, readDensity, () => "comfortable");
}

export function setDensity(density: Density) {
  try {
    if (density === "compact") localStorage.setItem(DENSITY_KEY, "compact");
    else localStorage.removeItem(DENSITY_KEY);
  } catch { /* the attribute below still applies for this visit */ }

  if (density === "compact") document.documentElement.dataset.consoleDensity = "compact";
  else delete document.documentElement.dataset.consoleDensity;

  announce();
}

/**
 * One key per *screen*, not per address: `/admin/forms/7/submissions` and
 * `/admin/forms/9/submissions` are the same table with different rows.
 */
export function screenKey(pathname: string): string {
  return pathname.replace(/\/\d+(?=\/|$)/g, "/:id");
}

/**
 * The hidden columns of a screen, as the raw stored string.
 *
 * A string rather than an array because `useSyncExternalStore` compares
 * snapshots by identity, and a freshly parsed array is a new one every time —
 * the infinite-render trap. The component parses it.
 */
export function useHiddenColumnsRaw(key: string): string {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(COLUMNS_PREFIX + key) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
}

/** Column headings, as stored — never indexes, so a column added later shifts nothing. */
export function parseHidden(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setHiddenColumns(key: string, labels: string[]) {
  try {
    if (labels.length === 0) localStorage.removeItem(COLUMNS_PREFIX + key);
    else localStorage.setItem(COLUMNS_PREFIX + key, JSON.stringify(labels));
  } catch { /* nothing to remember it in */ }

  announce();
}
