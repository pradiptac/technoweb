"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A modal dialog, built on the real `<dialog>` element.
 *
 * **Native rather than a div with `role="dialog"`**, and the reason is the
 * list of things that come free and are each individually easy to get wrong:
 * focus is trapped inside while it is open, Escape closes it, the rest of the
 * document is inert to a screen reader, and it renders in the browser's top
 * layer — so it cannot be clipped by an ancestor's `overflow` or lose a
 * z-index argument with the sticky console header. A hand-rolled trap is
 * roughly a hundred lines that has to be right on the first tab press and on
 * the last one.
 *
 * Two properties this project cares about specifically. A closed `<dialog>`
 * computes to `display: none`, so it contributes nothing to
 * `documentElement.scrollWidth` and cannot trip the zero-tolerance overflow
 * check — the problem the mobile drawer needs `visibility` to solve. And
 * because the browser restores focus to whatever opened it, the trigger is
 * still where the keyboard left it when the dialog closes.
 *
 * `showModal()` has to be called imperatively — there is no `open` attribute
 * that produces a *modal* dialog, only a non-modal one, which is a different
 * element with none of the guarantees above.
 */
export function Modal({
  open, onClose, title, description, children, footer, labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title. Optional — most dialogs do not need one. */
  description?: ReactNode;
  children: ReactNode;
  /** Buttons, pinned under the scrolling body. */
  footer?: ReactNode;
  /** Overrides the generated id, when a caller already labels its heading. */
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  /*
    `useId`, not a random string in a ref.

    Two things wrong with the obvious version: reading `.current` during render
    and calling `Math.random()` there are both impure, which React's lint rules
    now refuse outright — and a random id differs between the server render and
    the client one, so the `aria-labelledby` would point at nothing until
    hydration replaced it.
  */
  const headingId = useId();

  useEffect(() => {
    const dialog = ref.current;

    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /*
    `close` fires for Escape and for the backdrop's own dismissal as well as
    for our button, so the parent's state is told about all three from one
    place. Without this, Escape closes the element and leaves `open` true —
    and the dialog can then never be reopened, because the effect above sees
    no change to act on. That is the classic native-dialog bug.
  */
  useEffect(() => {
    const dialog = ref.current;

    if (!dialog) return;

    dialog.addEventListener("close", onClose);

    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy ?? headingId}
      /*
        Clicking the backdrop closes it. The check is which element the press
        landed on: the backdrop is painted by the dialog itself, so a click
        outside the panel still reports the dialog as its target — comparing
        against `currentTarget` is what tells "the sheet" from "beside it".
        A pointerdown-and-up pair is not required here because a drag that
        starts inside and ends outside reports the panel, not the dialog.
      */
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        // The element is its own positioning context in the top layer; these
        // centre it and keep it off the edges of a small screen.
        "m-auto w-[calc(100vw-2rem)] max-w-[34rem] rounded-xl border border-line-strong bg-card p-0 text-ink shadow-2xl",
        // `max-height` with the body scrolling, rather than letting the sheet
        // grow: a record failing every check would otherwise run past the top
        // and bottom of a phone with its close button off-screen.
        "max-h-[min(38rem,calc(100dvh-4rem))]",
        "backdrop:bg-ink/50 backdrop:backdrop-blur-[2px]",
      )}
    >
      {/*
        A flex column so the header and footer stay put and only the middle
        scrolls. `min-h-0` on the body is what actually lets it shrink — a
        flex child's default `min-height: auto` refuses to go below its
        content and the overflow silently moves to the whole sheet.
      */}
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="font-display text-[16px] font-semibold leading-tight">
              {title}
            </h2>
            {description ? (
              <p className="measure mt-1 text-[12.5px] text-muted">{description}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
