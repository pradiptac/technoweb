"use client";

import { useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertsAsToasts } from "@/components/ui/alert-mode";
import { useToast } from "@/components/ui/toast";
import { usePresence } from "@/lib/hooks/use-presence";

/**
 * An inline message about the screen it sits on.
 *
 * **Not a toast, and the two are not interchangeable.** A toast is about
 * something that just *happened* and it leaves; this is part of what the page
 * says — a validation summary belongs above the form it is about, still there
 * when you scroll back to it.
 *
 * It lives in its own module rather than beside `Field` and `Input` because
 * closing it needs state, and `"use client"` on `input.tsx` would drag every
 * form control in the console over the client boundary with it. `input.tsx`
 * re-exports this, so all sixty-five call sites keep importing `Alert` from
 * where they always did.
 */
export function Alert({
  tone = "info", title, children, dismissible = true,
}: {
  tone?: "ok" | "warn" | "err" | "info";
  title: string;
  children?: ReactNode;
  /**
   * Whether it can be closed. On by default — the message is about the
   * reader's screen and they are allowed to put it away, and an × on some
   * alerts and not others is a control people stop looking for.
   *
   * Pass `false` for a message that is the only thing saying something
   * important, where dismissing it would leave nothing behind.
   */
  dismissible?: boolean;
}) {
  /*
    Dismissed is a state; gone is a moment later. `usePresence` keeps the
    node for `--duration-exit` with `data-leaving` stamped, so `.settle-in`
    in `globals.css` can fade it out the way it came in — before this the
    panel was removed in the frame the × was pressed, and a message that
    blinks out reads as the page losing something rather than the reader
    putting it away. Arrival needs nothing here: `@starting-style` on the
    class fires the moment the node is rendered.
  */
  const [dismissed, setDismissed] = useState(false);
  const { mounted, leaving } = usePresence(!dismissed);

  /*
    In the console an outcome is a toast — see `alert-mode.tsx`. Raised from
    an effect, and guarded by a ref holding the last message this instance
    raised: an effect's deps do not make it run once. `reactStrictMode`
    mounts, unmounts and remounts every component in development, so the
    effect ran twice on one mount and every console save showed two
    "Settings saved" cards (measured 2026-09-17: one press of Save on the
    brand form, two toasts). The ref survives that simulated remount where a
    dependency list cannot, and the same message re-rendered raises nothing;
    the body goes along as the toast's second line. `err` keeps the toast
    rule that a failure stays until it is dismissed, and every field the
    server named is still marked in place.
  */
  const asToast = useContext(AlertsAsToasts) && dismissible && (tone === "ok" || tone === "err");
  const toast = useToast();
  const raised = useRef<string | null>(null);
  useEffect(() => {
    const key = `${tone}\u0000${title ?? ""}`;
    if (!asToast || raised.current === key) return;
    raised.current = key;
    toast({ tone, title, body: children });
    // `children` is a fresh node each render; the message is the tone and the title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asToast, tone, title, toast]);

  if (!mounted || asToast) return null;

  /*
    Tokens on both sides, never a literal.

    These used to read `bg-err-soft border-[#f0d5d5] text-[#6d2020]` — an
    inverting background paired with two hexes picked for the light palette.
    In dark the panel went near-black while the text stayed dark maroon:
    1.53:1, on every alert in the console and the portal at once. It went
    unseen for so long because no audited route rendered an alert by default,
    and the check only looks at what is on the page.

    The text tokens are the same ones `Badge` uses, and are chosen to read on
    their own `-soft` tint in whichever scheme is live. The border is that text
    colour at low alpha, so it can never disagree with it again.
  */
  const tones = {
    ok: "bg-ok-soft border-ok/25 text-ok",
    warn: "bg-warn-soft border-warn/25 text-warn",
    err: "bg-err-soft border-err/25 text-err",
    info: "bg-info-soft border-info/25 text-info",
  } as const;

  return (
    <div
      role={tone === "err" ? "alert" : "status"}
      data-leaving={leaving || undefined}
      className={cn("settle-in mb-2.5 flex items-start gap-3 rounded border px-4 py-3.5 text-sm", tones[tone])}
    >
      <div className="min-w-0 flex-1">
        <b className="mb-0.5 block font-semibold">{title}</b>
        {children}
      </div>

      {dismissible && (
        /*
          24px, not the 16px the glyph wants.

          An alert routinely carries a link in its body — "Live at /downloads"
          — and `npm run audit` fails a target under 24px whenever another sits
          within 24px of its centre. Sizing the button to the icon would make
          this pass on a bare alert and fail on a useful one.

          `-my-1 -mr-1.5` pulls the larger box back into the padding so the
          panel does not grow around it.
        */
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={`Dismiss: ${title}`}
          className="-my-1 -mr-1.5 grid size-6 shrink-0 place-items-center rounded opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        >
          <svg
            viewBox="0 0 24 24" className="size-3.5" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
