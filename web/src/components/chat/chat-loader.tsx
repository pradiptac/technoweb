"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ComponentProps } from "react";

/**
 * Mounts the website assistant after the page has gone idle.
 *
 * `chat-widget.tsx` and what it pulls in — the lead form, the product card,
 * the rating and source chips — are ~16KB gzipped, on every public page, for
 * a panel most visitors never open. Loaded through `next/dynamic` with SSR
 * off, the chunk leaves the page's initial JavaScript; mounted only once the
 * browser reports itself idle (or after a short ceiling where it never
 * does), the fetch no longer competes with the images and chunks the first
 * paint is waiting on. The launcher appears a moment after the page does,
 * which on a page that has just painted is the right order.
 *
 * The whole widget rather than the panel alone, deliberately: its state,
 * refs and focus timing are one component that a browser probe measures at
 * six widths, and splitting the launcher off would be a larger change for
 * the same bytes.
 */
const ChatWidget = dynamic(() => import("./chat-widget").then((m) => m.ChatWidget), { ssr: false });

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function ChatLoader(props: ComponentProps<typeof ChatWidget>) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as IdleWindow;
    // A ceiling, so a page that never goes idle — a long carousel, analytics
    // still chattering — still gets its assistant within a couple of seconds.
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  return ready ? <ChatWidget {...props} /> : null;
}
