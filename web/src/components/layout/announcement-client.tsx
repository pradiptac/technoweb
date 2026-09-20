"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { IconClose } from "@/components/icons-ui";
import { ANNOUNCEMENT_KEY } from "@/lib/announcement";
import { cn } from "@/lib/utils";

/*
 * Whether this announcement was closed, read the way `lib/consent.ts` reads
 * consent: a store outside React, subscribed through `useSyncExternalStore`,
 * with a server snapshot that says "open" so the first paint matches the
 * markup the server sent. Storage that throws (private mode, blocked)
 * reads as "open": a strip is not a modal, and the popup's fail-closed
 * argument does not apply to a band somebody can scroll past.
 */
const EVENT = "tw:announcement";
const listeners = new Set<() => void>();

function read(): string | null {
  try { return sessionStorage.getItem(ANNOUNCEMENT_KEY); } catch { return null; }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function dismiss(id: string) {
  try { sessionStorage.setItem(ANNOUNCEMENT_KEY, id); } catch { /* per-tab, best effort */ }
  document.documentElement.dataset.announcementClosed = "1";
  window.dispatchEvent(new Event(EVENT));
}

function useAnnouncementClosed(id: string): boolean {
  return useSyncExternalStore(subscribe, () => read() === id, () => false);
}

/** Renders the bar unless this announcement was closed; the console's preview always renders. */
export function AnnouncementShell({ id, preview = false, children }: { id: string; preview?: boolean; children: ReactNode }) {
  const closed = useAnnouncementClosed(id);
  if (closed && !preview) return null;
  return <>{children}</>;
}

/**
 * The × — 28px (the smallest that clears the 24px target floor with its
 * ring), in the band's own ink, at rest a little quieter and full under the
 * pointer. Element opacity only: the colours stay whatever the band derived,
 * so the audit reads the same ink it graded. In the console's preview it is
 * inert.
 */
export function AnnouncementClose({ id, preview = false }: { id: string; preview?: boolean }) {
  return (
    <button
      type="button"
      onClick={preview ? undefined : () => dismiss(id)}
      tabIndex={preview ? -1 : undefined}
      aria-label="Close this announcement"
      className={cn(
        "absolute top-1/2 right-2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-current",
        "opacity-70 transition-opacity duration-(--duration-fast) hover:opacity-100 focus-visible:opacity-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
      )}
    >
      <IconClose className="size-3.5" />
    </button>
  );
}
