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
 * It also guards against losing a half-filled form to a refresh or a closed
 * tab. That guard is honest about its reach — `beforeunload` cannot see an
 * in-app navigation, so clicking a link in the sidebar still discards the
 * form without asking. Catching that needs the router-level interception the
 * App Router does not currently expose.
 *
 * A screen that saves through a function rather than a `<form>` — the menu
 * builder, the campaign editor — passes `dirty` itself, from `useSaveStatus`,
 * and the bar guards on that instead of listening to a form it is not inside.
 * Those two used to draw their own sticky bar with the same guard, which is
 * how the console had two save bars that agreed on everything but the tint.
 */
export function FormActions({
  children, className, dirty: controlled,
}: {
  children: ReactNode;
  className?: string;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (controlled === undefined) return;
    const confirmLeaving = (e: BeforeUnloadEvent) => {
      if (controlled) e.preventDefault();
    };
    window.addEventListener("beforeunload", confirmLeaving);
    return () => window.removeEventListener("beforeunload", confirmLeaving);
  }, [controlled]);

  useEffect(() => {
    if (controlled !== undefined) return;
    const form = ref.current?.closest("form");
    if (!form) return;

    let dirty = false;
    const touched = () => { dirty = true; };
    const saved = () => { dirty = false; };
    const confirmLeaving = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };

    form.addEventListener("input", touched);
    form.addEventListener("change", touched);
    form.addEventListener("submit", saved);
    window.addEventListener("beforeunload", confirmLeaving);

    return () => {
      form.removeEventListener("input", touched);
      form.removeEventListener("change", touched);
      form.removeEventListener("submit", saved);
      window.removeEventListener("beforeunload", confirmLeaving);
    };
  }, [controlled]);

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
