"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconArrowRight, IconCart, IconCheck } from "@/components/icons-ui";
import { cn } from "@/lib/utils";

type Stage = "idle" | "pending" | "added";

/**
 * The product page's "Add to basket", in four stages that flow into each
 * other rather than swapping. The rules for it live beside `.add-basket` in
 * `globals.css`; this file is the markup and the two decisions the markup
 * makes.
 *
 * **Idle** — a full-width pill: the cart at the left edge, the label centred,
 * an arrow at the right. Hover and focus nudge the arrow 4px and lift the
 * pill 1px, both on `translate`. **Pending** — the Server Action is running:
 * the label and the arrow fade, the cart glides to the centre and a filled
 * copy of it fills from the bottom on a loop, the site's one loader that is
 * drawn as the thing being waited on. The button carries `disabled` and
 * `aria-busy` exactly as `Button pending` does, and its accessible name is
 * "Adding…". **Added** — for the three seconds `AddToBasket` keeps
 * `justAdded`: the pill turns `ok-fill`, a check scales into a translucent
 * disc at the left, the label crossfades to "Added to basket" and the cart
 * slides to the right edge; the whole control is a link to `/cart`, as the
 * old "Added · View basket" was. Then back to idle.
 *
 * **Three slots, and the cart is in none of them.** The pill is a
 * three-column grid — disc | label | arrow — so every slot is reserved in
 * every stage and nothing reflows when a label fades: both labels sit in
 * the same grid cell. The cart rides on an absolutely positioned *track* as
 * wide as the run from the left slot's centre to the right slot's centre,
 * and moves by `translate: 0 / 50% / 100%` of its own width — a percentage
 * translate is of the element's own box, which is why the track is the
 * element that moves and the glyph merely sits at its left end. `overflow:
 * hidden` on the pill is load-bearing: at `100%` the track hangs past the
 * right edge, and an absolute box outside a clipping ancestor is exactly
 * what widens the document.
 *
 * **The success stage is a different element, so the swap is animated with
 * `@starting-style`.** A link is not a button and cannot pretend to be one,
 * so the added stage mounts an `<a>` and the idle stage remounts the
 * `<button>`. Each arrives from the look the other left it in: the link
 * from the pending look (cart centred, label hidden, brand fill), the
 * button from the added look — but only when it *is* returning, which is
 * what `data-from="added"` says. Without that gate the first server-rendered
 * button would arrive green and fade to brand on every cold load.
 * `everAdded` is derived during render, not in an effect, so hydration sees
 * the same tree the server drew.
 *
 * "Out of stock" is the ordinary `Button`, unchanged.
 */
export function AddToBasketButton({
  pending,
  justAdded,
  available,
}: {
  pending: boolean;
  justAdded: boolean;
  available: boolean;
}) {
  const stage: Stage = justAdded && !pending ? "added" : pending ? "pending" : "idle";

  // Stamped once the control has been through the added stage, so a
  // remounted idle button knows it is returning from green rather than
  // arriving cold. Set during render, the shape the set-state-in-effect rule
  // allows for state derived from props.
  const [everAdded, setEverAdded] = useState(false);
  if (stage === "added" && !everAdded) setEverAdded(true);

  if (!available) {
    return (
      <Button type="submit" disabled className="w-full">
        Out of stock
      </Button>
    );
  }

  const className = cn(
    // `btn`, so the motion families in globals.css reach it like every
    // other button. Relative and clipped for the track (see above).
    "add-basket btn group relative grid w-full cursor-pointer overflow-hidden",
    "grid-cols-[1.5rem_1fr_1.5rem] items-center gap-3 rounded-full px-5 py-[13px]",
    "text-15 font-semibold whitespace-nowrap select-none",
    "border border-transparent shadow-2 hover:-translate-y-px",
    stage === "added"
      ? "bg-ok-fill text-white hover:brightness-110"
      : "bg-brand-600 text-brand-on hover:bg-brand-700",
    "disabled:cursor-progress disabled:translate-y-0",
  );

  const inner = (
    <>
      {/* Left slot: the success disc. Present in every stage so the slot is
          reserved; hidden by stage, scaled in by the keyframe. */}
      <span aria-hidden className="add-basket__disc grid size-6 place-items-center rounded-full bg-white/20">
        <IconCheck className="size-3.5" />
      </span>

      {/* Centre slot: both labels in one grid cell, so the cell is sized by
          the longer and the pill never changes width as one fades. Only
          the current stage's label is in the accessible name. */}
      <span className="grid text-center">
        <span aria-hidden={stage !== "idle"} className="add-basket__label add-basket__label-idle [grid-area:1/1]">
          Add to basket
        </span>
        <span aria-hidden={stage !== "added"} className="add-basket__label add-basket__label-added [grid-area:1/1]">
          Added to basket
        </span>
        {stage === "pending" && <span className="sr-only">Adding…</span>}
      </span>

      {/* Right slot: the arrow. Nudges on hover, fades while pending, and
          gives its slot to the cart once added. */}
      <IconArrowRight className="add-basket__arrow size-5" />

      {/* The cart on its track. The stroked glyph is the site's own; the
          filled copy beneath it is what the pending loop reveals from the
          bottom up, clipped so it is empty at rest. */}
      <span aria-hidden className="add-basket__track pointer-events-none absolute">
        <span className="add-basket__cart relative block size-5">
          <IconCart className="absolute inset-0 size-5" />
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="add-basket__fill absolute inset-0 size-5" aria-hidden>
            <path d="M6.4 6.5h14.1l-2.1 8.2h-11z" />
            <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
          </svg>
        </span>
      </span>
    </>
  );

  if (stage === "added") {
    return (
      <Link href="/cart" className={className} data-stage="added">
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="submit"
      className={className}
      data-stage={stage}
      data-from={everAdded ? "added" : undefined}
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {inner}
    </button>
  );
}
