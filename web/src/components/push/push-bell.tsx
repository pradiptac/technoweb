"use client";

import { useState, useSyncExternalStore } from "react";
import { IconBell } from "@/components/icons-ui";
import { useConsent } from "@/lib/consent";
import { subscribePushAction, unsubscribePushAction } from "@/lib/push-actions";
import { cn } from "@/lib/utils";
import type { PushConfig } from "@/lib/push";

const TOKEN_KEY = "tw_push_token";
const PUSH_EVENT = "tw:push";

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function subscribeStore(onChange: () => void): () => void {
  window.addEventListener(PUSH_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PUSH_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/**
 * The push bell — on the store strip and in the portal header.
 *
 * **Nothing happens on load.** The browser's permission prompt is asked for
 * only when the bell is pressed, and the code that talks to Firebase is a
 * dynamic import inside that press (`lib/push-client.ts`), so a visitor who
 * never presses it downloads a button. Where the cookie banner is drawn, the
 * bell waits for that question to be answered first rather than stacking a
 * second prompt on top of it.
 *
 * The server draws it as an inert bell (`useSyncExternalStore`'s server
 * snapshot), so a cached shop page is the same for everybody; whether this
 * browser is subscribed is read from `localStorage` after hydration.
 */
export function PushBell({ config, consentGated, className }: { config: PushConfig; consentGated: boolean; className?: string }) {
  const token = useSyncExternalStore(subscribeStore, readToken, () => null);
  const supported = useSyncExternalStore(() => () => {}, canPush, () => true);
  const consent = useConsent();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!supported) return null;

  const waiting = consentGated && consent === null;
  const on = token !== null;

  const press = async () => {
    if (waiting) {
      setNote("Answer the cookie question first.");
      return;
    }

    setBusy(true);
    setNote(null);

    try {
      const client = await import("@/lib/push-client");

      if (on) {
        await client.unsubscribe();
        await unsubscribePushAction(token);
        window.localStorage.removeItem(TOKEN_KEY);
        setNote("Notifications are off for this browser.");
      } else {
        const fresh = await client.subscribe(config);
        await subscribePushAction(fresh);
        window.localStorage.setItem(TOKEN_KEY, fresh);
        setNote("Notifications are on for this browser.");
      }

      window.dispatchEvent(new Event(PUSH_EVENT));
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        onClick={press}
        disabled={busy}
        aria-pressed={on}
        aria-label={on ? "Turn off notifications from this site" : "Get notifications from this site"}
        title={on ? "Notifications on — press to turn off" : "Get notifications about offers and your orders"}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full border border-line-strong bg-card text-ink-2",
          "transition-[border-color,color] duration-(--duration-fast) hover:border-brand-ink/40 hover:text-brand-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60",
          on && "border-brand-ink/40 text-brand-ink",
        )}
      >
        <IconBell className="size-4.5" />
        {on && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-600" />}
      </button>
      {/* Mounted empty and kept, so a message is announced when it changes. */}
      <span role="status" className={cn("absolute right-0 top-full z-10 mt-1 w-max max-w-[16rem] text-right text-12 text-muted", note && "rounded border border-line bg-card px-2 py-1")}>
        {note}
      </span>
    </span>
  );
}
