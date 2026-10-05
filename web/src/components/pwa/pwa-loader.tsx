"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * The installable website's browser half (2026-10-05, docs/pwa.md), mounted by
 * the public layout only.
 *
 * Registers `/sw.js` once the page is idle — never in the way of the first
 * paint — with the setting in its query string: `pwa=1` caches and serves
 * offline, `pwa=0` is push only and deletes every cache the worker made. So
 * switching the setting off reaches each browser on its next visit without
 * unregistering anything, which would also take its push subscription.
 *
 * In `next dev` nothing is registered unless `PWA_IN_DEV=1` was set for the
 * server: dev chunk names are not content hashes, and a cache-first worker
 * would serve yesterday's code to a developer for no reason they could see.
 *
 * The install card is its own chunk, loaded only when it may be shown.
 */
const InstallPrompt = dynamic(() => import("./install-prompt").then((m) => m.InstallPrompt), { ssr: false });

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function PwaLoader({ enabled, prompt, register, version, name }: {
  enabled: boolean;
  prompt: boolean;
  /** False in development unless asked for. */
  register: boolean;
  version: string;
  name: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const w = window as IdleWindow;
    const go = () => {
      if (register) {
        if (enabled) {
          navigator.serviceWorker.register(`/sw.js?pwa=1&v=${encodeURIComponent(version)}`, { scope: "/" }).catch(() => undefined);
        } else {
          // Off: only a worker that is caching is replaced — a push-only one,
          // or none at all, is left exactly as it is.
          navigator.serviceWorker.getRegistration("/").then((reg) => {
            if (reg?.active?.scriptURL.includes("pwa=1")) {
              navigator.serviceWorker.register("/sw.js?pwa=0", { scope: "/" }).catch(() => undefined);
            }
          }).catch(() => undefined);
        }
      }
      setReady(true);
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(go, 2000);
    return () => window.clearTimeout(t);
  }, [enabled, register, version]);

  return ready && enabled && prompt ? <InstallPrompt name={name} /> : null;
}
