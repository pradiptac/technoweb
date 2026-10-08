import type { ComponentPropsWithRef } from "react";

/**
 * A small sliding switch: a real checkbox the eye does not see, and a track
 * with a thumb drawn after it (0.135.0).
 *
 * Still `<input type="checkbox">` underneath — `role="switch"` only changes
 * how it is announced — so a label's `htmlFor`, Space, a form's own posting
 * and every `checked` a caller already passes work exactly as they did for
 * the tick box this replaces. Put it inside (or beside) its `<label>`.
 *
 * The input is **over the track at zero opacity**, not `sr-only`: clipped to
 * a pixel it cannot be pressed where it is drawn, which a screen reader's
 * touch exploration and a browser test's `setChecked()` both rely on. It is
 * 24px tall on a 20px track, the tap-target floor. The track is its next
 * sibling because the look is keyed on `peer-*`, and takes no pointer events
 * so the press always lands on the input.
 *
 * The thumb moves with the CSS `translate` property: Tailwind v4's
 * `translate-x-*` sets `translate`, not `transform`, so
 * `transition-transform` would animate nothing and the thumb would jump
 * (CLAUDE.md, "Motion and the Tailwind v4 transform trap"). Reduced motion
 * is the global rule's: no transition runs and the thumb is simply there.
 *
 * Colours: the track at rest is `faint` (4.9:1 on white, and a light grey on
 * the dark page), on it is `brand-600`; the thumb is `card` at rest and
 * `brand-on` when on. Both invert with the scheme, which is the point: in
 * dark the resting track is a light grey and the 600 fill is bright, so a
 * white thumb would all but disappear on either.
 */
export function Switch({ className, ...props }: Omit<ComponentPropsWithRef<"input">, "type" | "role">) {
  return (
    <span className={["relative inline-flex h-5 w-9 shrink-0", className ?? ""].join(" ")}>
      <input
        {...props}
        type="checkbox"
        role="switch"
        className="peer absolute -top-0.5 left-0 z-10 m-0 h-6 w-9 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        data-switch
        className={[
          "pointer-events-none absolute inset-0 rounded-full bg-faint",
          "transition-[background-color] duration-(--duration-fast) ease-brand",
          "after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-card after:shadow-1",
          "after:transition-[translate,background-color] after:duration-(--duration-fast) after:ease-brand",
          "peer-checked:bg-brand-600 peer-checked:after:translate-x-4 peer-checked:after:bg-(--color-brand-on)",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-ink",
          "peer-disabled:opacity-50",
        ].join(" ")}
      />
    </span>
  );
}
