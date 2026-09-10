"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { IconClose } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Popup } from "@/types/api";

/**
 * A picture shown over a page, with a link on it.
 *
 * ## Why the matching happens here
 *
 * A layout has no pathname in the App Router, so the server cannot answer "the
 * popup for this page" — it sends every live one and this matches against
 * `usePathname()`. That is a handful of rows of public content against a round
 * trip per navigation, which is the right way round.
 *
 * The rows arrive already ordered by the API, so **the first match wins and
 * exactly one popup is ever shown**. Two stacked over one page is not a feature
 * anybody asked for and is how a site becomes unusable.
 *
 * ## It is a real `<dialog>`
 *
 * Not the shared `Modal`: that is a titled card with a padded body and a
 * footer, and overriding its width, background, padding and header leaves
 * nothing but the three `<dialog>` mechanics — which is exactly the argument
 * `gallery.tsx`'s lightbox already makes, so the three are reproduced here the
 * same way.
 *
 * A closed `<dialog>` computes to `display: none`, so while it is shut it
 * contributes nothing to `documentElement.scrollWidth` and cannot trip the
 * zero-tolerance overflow check the audits run.
 *
 * **It takes focus, and that is the honest choice.** The cookie banner
 * deliberately is *not* a dialog — it is optional and interrupting somebody
 * mid-sentence over it would be rude — but a popup covers the page by
 * definition, and one that covers the page while leaving focus behind it is
 * worse for a keyboard or screen-reader user than one that admits what it is.
 */

/** How long "once a day" lasts. */
const A_DAY = 24 * 60 * 60 * 1000;

/**
 * Does this path pattern cover the page we are on?
 *
 * Three forms, and the API only ever sends these three — a section becomes a
 * subtree, `home` stays exact, and an editor's own patterns are shape-checked
 * on write:
 *
 * - `*` — the whole site
 * - `/store/*` — `/store` **and** anything beneath it
 * - `/contact` — that page exactly
 *
 * The subtree form matches the prefix itself as well as its descendants, so
 * ticking "Store" covers `/store` and `/store/products/x` without the API
 * having to send two patterns for one decision.
 */
function matches(pattern: string, path: string): boolean {
  if (pattern === "*") return true;

  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2) || "/";

    return path === prefix || path.startsWith(prefix === "/" ? "/" : `${prefix}/`);
  }

  /*
   * Trailing slashes are normalised away on both sides. Next does not produce
   * one, but a pattern typed by hand very often carries it, and "/contact/"
   * silently matching nothing is the kind of thing somebody loses an afternoon
   * to.
   */
  const exact = pattern.length > 1 ? pattern.replace(/\/+$/, "") : pattern;
  const here = path.length > 1 ? path.replace(/\/+$/, "") : path;

  return exact === here;
}

/** The storage key for one popup's "already seen" mark. */
const seenKey = (id: number) => `tw_popup_${id}`;

/**
 * Has this visitor already been shown it?
 *
 * **Fails closed**, the call `chat-widget.tsx` makes for the same reason: a
 * private window or blocked site data means "already shown", because that is
 * the safe direction for something that appears over what somebody is reading.
 * The alternative — treating a throw as "never seen" — turns a blocked-storage
 * browser into one where the popup opens on every single page.
 */
function alreadySeen(popup: Popup): boolean {
  if (popup.frequency === "every") return false;

  try {
    if (popup.frequency === "day") {
      const at = Number(window.localStorage.getItem(seenKey(popup.id)));

      return Number.isFinite(at) && at > 0 && Date.now() - at < A_DAY;
    }

    return window.sessionStorage.getItem(seenKey(popup.id)) === "1";
  } catch {
    return true;
  }
}

/**
 * Write the mark.
 *
 * `sessionStorage` for "not this visit" and `localStorage` for "not today" —
 * the split is a statement about *whose* decision it is. "Not this visit" ends
 * when they close the browser, and only the visitor can end it; "not today" has
 * to outlive that or it means nothing.
 */
function markSeen(popup: Popup): void {
  if (popup.frequency === "every") return;

  try {
    if (popup.frequency === "day") {
      window.localStorage.setItem(seenKey(popup.id), String(Date.now()));

      return;
    }

    window.sessionStorage.setItem(seenKey(popup.id), "1");
  } catch {
    // Nothing to do. The popup is open either way, and the next page is where
    // this would have mattered.
  }
}

/** The ceiling per size. The API sends the number; this is the fallback. */
const WIDTH: Record<string, number> = { small: 420, medium: 560, large: 760 };

export function SitePopup({ popups }: { popups: Popup[] }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  /*
    The first live popup whose patterns cover this page.

    Memoised on the pathname rather than recomputed per render, because this
    runs on every navigation of every page on the public site.
  */
  const popup = useMemo(
    () => popups.find((p) => p.paths.some((pattern) => matches(pattern, pathname))) ?? null,
    [popups, pathname],
  );

  const close = useCallback(() => ref.current?.close(), []);

  /*
    Open it, after its own delay.

    The timer is abandoned on navigation — the effect's cleanup — so a popup
    that had not yet appeared does not open over the page somebody moved on to.
    `markSeen` runs at the moment it opens rather than when it is dismissed:
    somebody who navigates away from a popup has still been shown it, and
    counting only dismissals would show it again on the next page.
  */
  useEffect(() => {
    if (!popup || alreadySeen(popup)) return;

    /*
      Captured now rather than read in the cleanup. A ref is attached before
      effects run, so this is the dialog — and by the time the cleanup fires,
      `ref.current` may point at a different node or none at all, which is
      exactly what `react-hooks/exhaustive-deps` warns about here.
    */
    const dialog = ref.current;

    const timer = window.setTimeout(() => {
      markSeen(popup);
      setOpen(true);
    }, Math.max(0, popup.delay_ms));

    return () => {
      window.clearTimeout(timer);

      /*
        Closing the **element**, not the state, and that is the whole reason
        this sits in the cleanup rather than in an effect of its own keyed on
        the pathname.

        `setState` synchronously inside an effect body is a cascading render
        and `react-hooks/set-state-in-effect` refuses it outright. Calling
        `close()` is a DOM call: it fires the element's own `close` event, the
        listener below hears it, and the state settles from an event handler
        where it belongs. Same destination, and the rule stays satisfied rather
        than suppressed.

        `setTimeout` is the exception the rule already allows — it is
        asynchronous, so the `setOpen` above is not in the effect body at all.
      */
      dialog?.close();
    };
  }, [popup]);

  /* `showModal()` has to be called imperatively — there is no attribute that
     produces a *modal* dialog, only a non-modal one. */
  useEffect(() => {
    const dialog = ref.current;

    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  /*
    The `close` event, and it is not optional.

    Escape and the backdrop close the *element* directly, so a component
    tracking `open` in state never hears about it: the state stays true, the
    effect above sees no change, and the dialog can never be reopened. That is
    the classic native-dialog bug and it looks exactly like a broken button.
  */
  useEffect(() => {
    const dialog = ref.current;

    if (!dialog) return;

    const onClose = () => setOpen(false);

    dialog.addEventListener("close", onClose);

    return () => dialog.removeEventListener("close", onClose);
  }, []);

  if (!popup || !popup.image) return null;

  const width = popup.width ?? WIDTH[popup.size ?? "medium"] ?? 560;

  const picture = (
    /*
      A plain <img>, not next/image, for the reason the slider and the gallery
      both give: the source is a runtime URL on the API's own origin, and
      `images.remotePatterns` names only the development host today. next/image
      would work here and 400 in production.

      `width`/`height` are the *natural* dimensions from the media library, and
      they are attributes rather than CSS: that is what makes the browser
      reserve the right box before the bytes land. Absent when the library has
      no row for the path, in which case there is nothing honest to reserve.
    */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={popup.image}
      alt={popup.image_alt ?? ""}
      width={popup.image_width ?? undefined}
      height={popup.image_height ?? undefined}
      className="block h-auto w-full rounded-xl"
    />
  );

  return (
    <dialog
      ref={ref}
      aria-label={popup.image_alt ?? "Announcement"}
      // The backdrop, told from the panel by comparing the event's target with
      // the element it is bound to.
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] overflow-visible bg-transparent p-0",
        "backdrop:bg-dark/60 backdrop:backdrop-blur-[2px]",
      )}
      style={{ maxWidth: `${width}px` }}
    >
      {/*
        `relative` so the close button can sit on the corner of the picture,
        and `max-h` on the *inner* box with the image set to contain: a tall
        piece of artwork on a short screen has to shrink rather than run off
        the bottom, where the close button would go with it.
      */}
      <div className="relative max-h-[calc(100dvh-4rem)] overflow-hidden rounded-xl bg-card shadow-2xl">
        {popup.link_url
          ? (
            <a
              href={popup.link_url}
              {...(popup.link_new_tab ? { target: "_blank", rel: "noreferrer" } : {})}
              onClick={close}
              className="block"
            >
              {picture}
            </a>
          )
          : picture}

        {/*
          44px, not the 24px the audit's floor would accept.

          This is the only way out of something covering the page, it sits over
          artwork nobody has seen yet, and it is the one control here — a
          dismiss people have to aim at is how a popup becomes the thing they
          leave the site over.

          **The disc is opaque, and that is a rule rather than a preference.**
          It was `bg-dark/70`, which is the trap this codebase has already
          written down twice. Measured in a browser: over the white card the
          real composite is `#606060` and white on it is **4.05:1** — a genuine
          AA failure. And `npm run audit` could not see it, because a Tailwind
          v4 opacity modifier resolves through `color-mix`, so the computed
          value came back as `oklab(0.188547 … / 0.7)` and the audit's parser
          reads that lightness channel as an RGB byte — grading white on
          near-black and reporting a pass. Solid `dark` is 17.9:1 against white
          whatever the artwork behind it, and it is a plain `rgb()` the check
          can actually read.
        */}
        <button
          type="button"
          onClick={close}
          className={cn(
            "absolute right-2 top-2 grid size-11 place-items-center rounded-full",
            "bg-dark text-white ring-1 ring-white/70 transition-colors",
            "hover:bg-dark-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
          )}
        >
          <span className="sr-only">Close</span>
          <IconClose className="size-5" />
        </button>
      </div>
    </dialog>
  );
}
