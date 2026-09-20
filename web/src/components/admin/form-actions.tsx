"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SaveMessage } from "@/lib/hooks/use-save-status";

/**
 * The Save / Cancel / Delete row at the foot of every admin form, pinned to
 * the bottom of the viewport while the form is taller than the screen.
 *
 * On a populated product these buttons sat below the rich-text editor, the
 * specifications repeater and the features repeater — a long scroll from
 * wherever the editor was actually working, in both directions, because you
 * have to come back up again afterwards.
 *
 * Sticky rather than fixed: on a short form it stays where it naturally
 * falls, so nothing floats over a half-empty page.
 *
 * It also guards against losing a half-filled form — to a refresh or a
 * closed tab through `beforeunload`, and to an in-app navigation through a
 * click listener on the document. The App Router exposes no interception
 * for a client-side route change, so the second guard catches the click
 * before `Link` does: a capture-phase listener that, while any bar on the
 * page is dirty, asks with `window.confirm` and cancels the event if the
 * answer is no (`Link` honours `defaultPrevented`). It leaves alone a
 * modified click, a new-tab link, a download, a hash change and a
 * cross-origin link (which `beforeunload` already covers). The palette's
 * `router.push` asks through `confirmLeave()` for the same reason. What
 * it still cannot see is the browser's Back button.
 *
 * And **Ctrl/⌘ S saves**: the bar's own submit button is pressed, or `onSave`
 * for a screen that saves through a function. A form is where people type
 * for a while, and the reflex is real.
 *
 * A screen that saves through a function rather than a `<form>` — the menu
 * builder, the campaign editor — passes `dirty` itself, from `useSaveStatus`,
 * and the bar guards on that instead of listening to a form it is not inside.
 * Those two used to draw their own sticky bar with the same guard, which is
 * how the console had two save bars that agreed on everything but the tint.
 */
const LEAVE_MESSAGE = "You have unsaved changes. Leave this page and lose them?";

/*
 * Every mounted bar registers a "dirty?" question here, and one document
 * listener asks them all — so two forms on a page, or a form beside a
 * function-saving screen, need no coordination.
 */
const dirtyChecks = new Set<() => boolean>();

export function isAnyFormDirty(): boolean {
  for (const check of dirtyChecks) if (check()) return true;
  return false;
}

/** True when it is fine to navigate away — nothing dirty, or the person said so. */
export function confirmLeave(): boolean {
  return !isAnyFormDirty() || window.confirm(LEAVE_MESSAGE);
}

function guardClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  if (url.pathname + url.search === location.pathname + location.search) return;
  if (!confirmLeave()) { e.preventDefault(); e.stopImmediatePropagation(); }
}

function guardUnload(e: BeforeUnloadEvent) {
  if (isAnyFormDirty()) e.preventDefault();
}

function register(check: () => boolean) {
  if (dirtyChecks.size === 0) {
    document.addEventListener("click", guardClick, true);
    window.addEventListener("beforeunload", guardUnload);
  }
  dirtyChecks.add(check);
  return () => {
    dirtyChecks.delete(check);
    if (dirtyChecks.size === 0) {
      document.removeEventListener("click", guardClick, true);
      window.removeEventListener("beforeunload", guardUnload);
    }
  };
}

export function FormActions({
  children, className, dirty: controlled, onSave,
}: {
  children: ReactNode;
  className?: string;
  dirty?: boolean;
  /** What Ctrl/⌘ S does on a screen that saves through a function. */
  onSave?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);

  // A controlled `dirty` is copied into the ref from an effect, so the
  // document listener reads one place whichever way the bar is driven.
  useEffect(() => {
    if (controlled !== undefined) dirtyRef.current = controlled;
  }, [controlled]);

  useEffect(() => register(() => dirtyRef.current), []);

  useEffect(() => {
    if (controlled !== undefined) return;
    const form = ref.current?.closest("form");
    if (!form) return;

    const touched = () => { dirtyRef.current = true; };
    const saved = () => { dirtyRef.current = false; };

    form.addEventListener("input", touched);
    form.addEventListener("change", touched);
    form.addEventListener("submit", saved);

    return () => {
      form.removeEventListener("input", touched);
      form.removeEventListener("change", touched);
      form.removeEventListener("submit", saved);
    };
  }, [controlled]);

  // Ctrl/⌘ S.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (onSave) { onSave(); return; }
      const form = ref.current?.closest("form");
      if (!form) return;
      const button = ref.current?.querySelector<HTMLButtonElement>('button[type="submit"]:not([disabled])');
      if (button) form.requestSubmit(button); else form.requestSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave]);

  return (
    <div
      ref={ref}
      // Named so `ScrollTop` can measure it and sit above it. At 360px this
      // bar wraps to two rows and the floating control landed squarely on
      // "Delete product" — a destructive action is the worst thing for a
      // convenience button to cover.
      data-form-actions=""
      className={cn(
        "sticky bottom-0 z-20 mt-6 flex flex-wrap items-center gap-3",
        // A background and a rule, or the form scrolls through it. Slightly
        // translucent so it reads as sitting above the page rather than
        // being the end of it.
        "border-t border-line bg-card/95 py-3 backdrop-blur-[6px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * "Unsaved changes" and the last save's outcome, for a bar driven by
 * `useSaveStatus`. A failure is `role="alert"` so it interrupts; a success
 * is `role="status"` so it waits — the toast's two live regions, in miniature.
 */
export function SaveStatus({ dirty, message = null }: { dirty: boolean; message?: SaveMessage | null }) {
  return (
    <>
      {dirty && <span className="text-12-5 text-faint">Unsaved changes</span>}
      {message && (
        <span
          role={message.tone === "err" ? "alert" : "status"}
          className={cn("text-12-5", message.tone === "err" ? "text-err" : "text-ok")}
        >
          {message.text}
        </span>
      )}
    </>
  );
}
