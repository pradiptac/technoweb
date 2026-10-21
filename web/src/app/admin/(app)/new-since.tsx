"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * What arrived while the console was open, on the sidebar and in the tab.
 *
 * `NewSincePoller` asks `/api/admin/new-since` once a minute, while the tab
 * is visible, for what was created after the moment the console was opened
 * — the moment is kept in `sessionStorage`, so a navigation does not reset
 * it and a new tab starts its own. The queues' rows carry a count badge
 * through `useNewSince()`, and the tab's title takes a "(3) " prefix: that
 * is the thing people actually glance at, from another tab, which is the
 * whole reason to poll.
 *
 * Opening a queue marks it seen: the count *at that moment* is remembered
 * per key, and a badge shows what has come in above it. The API's own
 * `since` never moves — one moment, three growing counts — so the two keys
 * clear independently without the API having to take a `since` per key.
 *
 * A module-level store read through `useSyncExternalStore`, the pattern the
 * ticket queue's selection uses and for the same reason: the poller sits in
 * the layout and the badges sit in the nav, with no shared client parent.
 * Sixty seconds, not real time — a support desk moves in minutes, and every
 * open console tab is one more request a minute on the API.
 */
type Counts = { tickets: number | null; leads: number | null; enquiries: number | null };
type Snapshot = { latest: Counts; seen: Partial<Record<keyof Counts, number>>; unread: number | null };

const EMPTY: Counts = { tickets: null, leads: null, enquiries: null };
let state: Snapshot = { latest: EMPTY, seen: {}, unread: null };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => state;
const SERVER: Snapshot = { latest: EMPTY, seen: {}, unread: null };
const serverSnapshot = () => SERVER;
function set(next: Snapshot) { state = next; listeners.forEach((l) => l()); }

const KEY = "tw_admin_since";
const SEEN_KEY = "tw_admin_seen";

function sinceMoment(): string {
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored) return stored;
    const now = new Date().toISOString();
    sessionStorage.setItem(KEY, now);
    return now;
  } catch {
    return new Date().toISOString();
  }
}

/** The badge routes: the queue's path and the count that belongs to it. */
export const NEW_SINCE_ROUTES: Record<string, keyof Counts> = { "/admin/tickets": "tickets", "/admin/leads": "leads" };

/** Unseen arrivals per key — what the badges and the title show. */
export function useNewSince(): Record<keyof Counts, number> {
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const unseen = (k: keyof Counts) => Math.max(0, (s.latest[k] ?? 0) - (s.seen[k] ?? 0));
  return { tickets: unseen("tickets"), leads: unseen("leads"), enquiries: unseen("enquiries") };
}

/** The bell's unread count from the minute poll; null when it could not be read, and then no number is drawn. */
export function useUnreadNotifications(): number | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot).unread;
}

let stopped = false;
async function poll() {
  if (document.visibilityState !== "visible") return;
  try {
    const res = await fetch(`/api/admin/new-since?since=${encodeURIComponent(sinceMoment())}`);
    if (stopped) return;
    const body = res.ok ? ((await res.json()) as { data: (Counts & { notifications_unread?: number }) | null }) : null;
    if (body?.data) {
      const { notifications_unread: unread, ...latest } = body.data;
      set({ ...state, latest, unread: typeof unread === "number" ? unread : null });
    } else {
      // The bell draws no number it could not read — never the last one (C2).
      set({ ...state, unread: null });
    }
  } catch {
    if (!stopped) set({ ...state, unread: null });
  }
}

/** Runs the poll once now — after the bell marks something read. */
export function refreshNewSince(): void {
  void poll();
}

export function NewSincePoller() {
  const pathname = usePathname();

  useEffect(() => {
    try { state = { ...state, seen: JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "{}") }; } catch { /* fresh */ }
    stopped = false;
    void poll();
    const id = setInterval(poll, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // Opening a queue marks its count seen.
  useEffect(() => {
    const key = NEW_SINCE_ROUTES[pathname];
    if (!key) return;
    const mark = () => {
      const latest = state.latest[key];
      if (latest === null || state.seen[key] === latest) return;
      const seen = { ...state.seen, [key]: latest };
      try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* per-tab only */ }
      set({ ...state, seen });
    };
    mark();
    return subscribe(mark);
  }, [pathname]);

  // The tab's title.
  const counts = useNewSince();
  const total = counts.tickets + counts.leads;
  useEffect(() => {
    const strip = (t: string) => t.replace(/^\(\d+\)\s/, "");
    const apply = () => {
      const want = total > 0 ? `(${total}) ${strip(document.title)}` : strip(document.title);
      if (document.title !== want) document.title = want;
    };
    apply();
    // Next rewrites <title> on navigation; put the prefix back when it does.
    const title = document.querySelector("title");
    const observer = title ? new MutationObserver(apply) : null;
    if (title && observer) observer.observe(title, { childList: true, characterData: true, subtree: true });
    return () => { observer?.disconnect(); document.title = strip(document.title); };
  }, [total]);

  return null;
}
