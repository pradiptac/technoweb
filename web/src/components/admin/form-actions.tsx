"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
 */
export function FormActions({
  children, className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, []);

  return (
    <div
      ref={ref}
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
