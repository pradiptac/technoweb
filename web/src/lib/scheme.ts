"use client";

import { useSyncExternalStore } from "react";

export const SCHEME_KEY = "tw_scheme";
export const SCHEME_EVENT = "tw:scheme";

/** What the visitor chose. "system" defers to the OS. */
export type SchemePreference = "light" | "dark" | "system";

/** What is actually painted. "system" is never a value here. */
export type ResolvedScheme = "light" | "dark";

/**
 * The colour-scheme preference, read from localStorage.
 *
 * `useSyncExternalStore` rather than state in an effect, for the same reason
 * `lib/consent.ts` uses it: localStorage is an external store, and the server
 * snapshot returning null is what stops the pre-hydration render from claiming
 * a preference it cannot know. The document is already painted correctly by
 * then — see the inline script in the root layout — so this hook exists to
 * drive the *control*, not the page.
 */
export function useSchemePreference(): SchemePreference {
  return useSyncExternalStore(subscribe, read, () => "system" as const);
}

function read(): SchemePreference {
  try {
    const value = localStorage.getItem(SCHEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    // A browser with storage blocked still gets a working site, following the
    // OS, rather than a crash on first paint.
    return "system";
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SCHEME_EVENT, onChange);
  // `storage` fires in *other* tabs, which is what keeps two open tabs from
  // disagreeing after a change in one of them.
  window.addEventListener("storage", onChange);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);

  return () => {
    window.removeEventListener(SCHEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    mq.removeEventListener("change", onChange);
  };
}

/** Store the choice and repaint immediately. */
export function setSchemePreference(preference: SchemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(SCHEME_KEY);
    else localStorage.setItem(SCHEME_KEY, preference);
  } catch {
    // Storage being unavailable must not stop the page changing now; the
    // choice simply will not survive a reload.
  }

  applyScheme(resolve(preference));
  window.dispatchEvent(new Event(SCHEME_EVENT));
}

export function resolve(preference: SchemePreference): ResolvedScheme {
  if (preference !== "system") return preference;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Paint it.
 *
 * `data-scheme` is what the stylesheet keys on; `color-scheme` is what tells
 * the browser to render its *own* furniture — scrollbars, form controls, the
 * spellcheck underline — to match. Without the second, a dark page keeps white
 * scrollbars and light-mode date pickers.
 */
export function applyScheme(scheme: ResolvedScheme): void {
  const root = document.documentElement;
  root.dataset.scheme = scheme;
  root.style.colorScheme = scheme;
}

/**
 * What is actually painted right now, for a component that has to match it.
 *
 * The server snapshot is "light" because the server cannot know — the document
 * itself is already correct by then, painted by the inline script, so the only
 * thing this affects is a component that inspects the scheme rather than
 * inheriting it. The theme picker is the one that does: its cards paint
 * themselves in a palette rather than in tokens.
 */
export function useResolvedScheme(): ResolvedScheme {
  const preference = useSchemePreference();
  return useSyncExternalStore(
    subscribe,
    () => (preference === "system" ? resolve("system") : preference),
    () => "light" as const,
  );
}
