"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  const [gone, setGone] = useState(false);

  if (gone) return null;

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
      className={cn("mb-2.5 flex items-start gap-3 rounded border px-4 py-3.5 text-sm", tones[tone])}
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
          onClick={() => setGone(true)}
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
