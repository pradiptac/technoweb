"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ToastTone = "ok" | "warn" | "err" | "info";

export type ToastInput = {
  tone?: ToastTone;
  title: string;
  /** Optional second line. Keep it to a sentence — this is not a panel. */
  body?: ReactNode;
  /**
   * Override the auto-dismiss, in milliseconds. `0` means "stays until
   * dismissed", which is what `warn` and `err` do by default — see DURATION.
   */
  duration?: number;
};

type Toast = ToastInput & { id: number; tone: ToastTone };

/**
 * How long each tone stays before it removes itself.
 *
 * **A failure never dismisses itself.** A success is a confirmation of
 * something the person just did and already expected, so it can go; a failure
 * is news, and news that vanishes before it is read is an error the person
 * hits again with no idea why the first attempt did nothing. `warn` is the
 * same argument one step down.
 *
 * Five seconds rather than three: three is comfortably less than the time it
 * takes to read two lines and look back up from whatever you were doing.
 */
const DURATION: Record<ToastTone, number> = {
  ok: 5000,
  info: 5000,
  warn: 0,
  err: 0,
};

/**
 * At most this many on screen at once.
 *
 * Not a cosmetic cap. `scripts/mobile-audit.mjs` fails any fixed element
 * taller than half the viewport, and half of a 320x568 phone is 284px — about
 * four of these. Dropping the oldest keeps the newest visible, which is the
 * one the person's action just produced.
 */
const MAX_VISIBLE = 3;

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

/**
 * Raise a toast from anywhere inside a `ToastProvider`.
 *
 * Returns a no-op outside one rather than throwing. A toast is a courtesy,
 * and a component that renders in two places should not crash the tree it
 * happens to be in the wrong half of.
 */
export function useToast(): (t: ToastInput) => void {
  return useContext(ToastContext) ?? (() => {});
}

/**
 * The floating notification region, and the state behind it.
 *
 * **Different from `Alert`, and both are right.** An `Alert` is part of what a
 * screen says: a validation summary belongs above the form it is about, in the
 * flow, still there when you scroll back. A toast is about something that has
 * just *happened* — it overlays rather than reflowing, and it leaves. The
 * console's `?done=` convention was rendering the second thing as the first:
 * an inline panel that pushed the page down and stayed until the next
 * navigation, for a message whose whole content was "that worked".
 *
 * **The regions are mounted empty and stay mounted.** This is the trap
 * `PasswordField` already documents for `Field`'s `note`: a live region that
 * appears with its message already inside it has not *changed*, so assistive
 * technology announces nothing. Both lists below render from first paint with
 * no children, and a toast is an insertion into an existing region.
 *
 * **Two regions rather than one**, because politeness is a property of the
 * region and not of the item in it. A failure interrupts; a confirmation waits
 * for a gap. One region could only ever do one of those.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const tone = input.tone ?? "info";
    const id = nextId.current++;

    setToasts((current) => [...current, { ...input, tone, id }].slice(-MAX_VISIBLE));
  }, []);

  const assertive = toasts.filter((t) => t.tone === "err" || t.tone === "warn");
  const polite = toasts.filter((t) => t.tone === "ok" || t.tone === "info");

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/*
        `pointer-events-none` on the wrapper and back on for each toast: this
        strip spans the full width across the top of every screen in the
        console, and without it the header's controls underneath it would stop
        answering the mouse on the routes where a toast is showing.

        `inset-x-0` with padding rather than a centring translate. A fixed
        element translated horizontally still contributes to
        `documentElement.scrollWidth`, which is the zero-tolerance overflow
        check in scripts/audit.mjs — the same rule the mobile drawer is built
        around.
      */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        <ToastRegion label="Errors and warnings" live="assertive" toasts={assertive} onDismiss={dismiss} />
        <ToastRegion label="Notifications" live="polite" toasts={polite} onDismiss={dismiss} />
      </div>
    </ToastContext.Provider>
  );
}

function ToastRegion({
  label, live, toasts, onDismiss,
}: {
  label: string;
  live: "polite" | "assertive";
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <ul
      aria-live={live}
      aria-label={label}
      // `contents` rather than a flex column: the wrapper above already lays
      // the toasts out, and two stacking contexts would put the assertive
      // region's toasts in a separate column from the polite one's.
      className="contents"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </ul>
  );
}

/**
 * Tokens on both sides, never a literal — the same table `Alert` uses.
 *
 * `bg-err-fill` on the icon and `text-err` on the words is not a stylistic
 * choice: `--color-err` is *coloured text on a panel*, so in dark it inverts
 * to a light pink, and white on light pink is 2.4:1. `--color-err-fill` exists
 * for exactly this second job. Getting the two the wrong way round is what put
 * every Delete button in the console at 2.4:1 in dark.
 */
const TONES: Record<ToastTone, { panel: string; badge: string }> = {
  ok: { panel: "bg-ok-soft border-ok/25 text-ok", badge: "bg-ok-fill" },
  warn: { panel: "bg-warn-soft border-warn/25 text-warn", badge: "bg-warn-fill" },
  err: { panel: "bg-err-soft border-err/25 text-err", badge: "bg-err-fill" },
  info: { panel: "bg-info-soft border-info/25 text-info", badge: "bg-info-fill" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [shown, setShown] = useState(false);
  const duration = toast.duration ?? DURATION[toast.tone];

  /*
    Mounted hidden, shown on the next frame.

    Setting the visible state in the same tick as the mount gives the browser
    one paint holding both states, so there is nothing to transition from and
    the toast simply appears. `requestAnimationFrame` puts a painted frame
    between them. Same shape as the header drawer waiting for a computed
    `visibility` before it moves focus.
  */
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));

    return () => cancelAnimationFrame(frame);
  }, []);

  /*
    The auto-dismiss clock, paused while the pointer or the keyboard is on it.

    Without the pause, a toast can expire under the cursor of somebody who is
    part-way through reading it, or — worse — while focus is on its own dismiss
    button, which then vanishes and drops focus to the top of the document.
  */
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!duration || paused) return;

    const timer = setTimeout(() => onDismiss(toast.id), duration);

    return () => clearTimeout(timer);
  }, [duration, paused, onDismiss, toast.id]);

  const tone = TONES[toast.tone];

  return (
    <li
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      /*
       * `translate` and `opacity`, and vertically only.
       *
       * Tailwind v4's translate utilities set the CSS `translate` property
       * rather than `transform`, so `transition-transform` here would animate
       * nothing at all and the toast would jump into place. And the movement
       * is vertical because a horizontal one widens the document — the same
       * rule the scroll reveals are built on.
       *
       * Reduced motion is handled globally: globals.css disables every
       * transition under the preference, which lands the toast at its end
       * state immediately rather than leaving it stuck at the start.
       */
      className={cn(
        "pointer-events-auto w-full max-w-[26rem] rounded-lg border shadow-lg",
        "flex items-start gap-3 p-3 text-sm",
        "transition-[translate,opacity] duration-200 ease-out",
        shown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        tone.panel,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("mt-px grid size-7 shrink-0 place-items-center rounded-md text-white", tone.badge)}
      >
        <ToastGlyph tone={toast.tone} />
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className="font-semibold">{toast.title}</p>
        {toast.body ? <div className="mt-0.5 opacity-90">{toast.body}</div> : null}
      </div>

      {/*
        A real button at 28px, not a 16px glyph.

        The audit fails any target under 24px that has another within 24px of
        its centre, and this one sits beside nothing — but a dismiss control
        that is hard to hit is a notification that stays on the screen, which
        is the whole complaint about the panel this replaces.
      */}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={`Dismiss: ${toast.title}`}
        className="-m-0.5 grid size-7 shrink-0 place-items-center rounded opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </li>
  );
}

/**
 * A glyph per tone, drawn rather than borrowed.
 *
 * `iconMap` is for icons that *stand for a thing* — a solution, a category —
 * and those are coloured from their own key. These four do a job, so they
 * inherit `currentColor` (white, on the tone's fill) like every other
 * functional mark in the set.
 */
function ToastGlyph({ tone }: { tone: ToastTone }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

  if (tone === "ok") {
    return <svg {...common} className="size-4"><path d="M4 12.5l5 5L20 6.5" /></svg>;
  }

  if (tone === "info") {
    return <svg {...common} className="size-4"><path d="M12 11v6M12 7.5h.01" /></svg>;
  }

  // warn and err share the exclamation; the panel colour is what separates
  // "this needs attention" from "this did not happen".
  return <svg {...common} className="size-4"><path d="M12 7v6M12 16.5h.01" /></svg>;
}
