"use client";

import { useSyncExternalStore } from "react";
import type { VisibleWishlist } from "@/components/store/wishlist-actions";

/**
 * The wishlist as every heart and the count on a page see it — one fetch per
 * page, however many hearts a grid draws.
 *
 * A module-level store read through `useSyncExternalStore`, the shape the
 * ticket queue's selection uses: forty cards each fetching `/api/store/wishlist`
 * after mount would be forty requests for one answer. The server snapshot is
 * null, so the render the ISR cache holds draws every heart empty and the
 * count at nothing; the first client subscriber asks once.
 *
 * `WISHLIST_EVENT` is announced after every change — a heart, a move to the
 * basket, a remove on the list page — with the new list as its `detail` when
 * the caller has it, so the store takes it without asking the server again;
 * an announcement with no detail makes it refetch. One name, as the basket
 * has one, so a second thing that changes the list cannot invent a signal
 * the count does not hear.
 */
export const WISHLIST_EVENT = "tw:wishlist";

type State = { list: VisibleWishlist | null; loaded: boolean };

let state: State = { list: null, loaded: false };
let started = false;
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function refresh() {
  fetch("/api/store/wishlist", { headers: { Accept: "application/json" }, cache: "no-store" })
    .then(async (res) => {
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(String(res.status));
      return ((await res.json()) as { data: VisibleWishlist }).data;
    })
    .then((list) => emit({ list, loaded: true }))
    // A failed read leaves whatever was showing: hearts that blink empty
    // because one request timed out read as the list being lost.
    .catch(() => emit({ ...state, loaded: true }));
}

function onAnnounce(event: Event) {
  const detail = (event as CustomEvent<VisibleWishlist | undefined>).detail;

  if (detail) emit({ list: detail, loaded: true });
  else refresh();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (!started && typeof window !== "undefined") {
    started = true;
    window.addEventListener(WISHLIST_EVENT, onAnnounce);
    refresh();
  }

  return () => {
    listeners.delete(listener);
  };
}

/** Tell every heart and the count that the list changed — with the list, when the caller has it. */
export function announceWishlistChange(list?: VisibleWishlist): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(WISHLIST_EVENT, { detail: list }));
}

/**
 * Put a guess on screen before the server answers — a heart pressed fills at
 * once. Not announced: the caller announces the real list when it arrives,
 * or puts the previous one back if the press was refused.
 */
export function setWishlistOptimistic(list: VisibleWishlist | null): void {
  emit({ list, loaded: true });
}

export function currentWishlist(): VisibleWishlist | null {
  return state.list;
}

const serverSnapshot: State = { list: null, loaded: false };

export function useWishlist(): State {
  return useSyncExternalStore(subscribe, () => state, () => serverSnapshot);
}
