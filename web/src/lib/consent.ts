"use client";

import { useSyncExternalStore } from "react";

export const CONSENT_KEY = "tw_cookie_consent";
export const CONSENT_EVENT = "tw:consent";

export type ConsentChoice = "granted" | "denied";

function read(): ConsentChoice | null {
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    // Private browsing, or storage disabled outright. Treated as "not yet
    // asked": the banner shows again and nothing loads. Failing toward not
    // tracking is the only safe direction here.
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  // Also the native storage event, so a choice made in one tab reaches the
  // others rather than leaving them tracking after a decline.
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The current consent choice, or null if nobody has answered.
 *
 * useSyncExternalStore rather than useState in an effect: localStorage is an
 * external store, this is precisely what the hook is for, and setting state
 * from an effect is both a lint error and a needless second render.
 *
 * The server snapshot is null, so the first paint never assumes consent — a
 * tracker that loads before hydration has already set its cookies.
 */
export function useConsent(): ConsentChoice | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** Records a choice and tells every listener in this tab immediately. */
export function setConsent(value: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Unstorable. The event below still applies the choice to this page view;
    // they will simply be asked again next time.
  }

  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}
