"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The info bar's third message style: one line at a time, rising from the
 * bottom (2026-09-23, the client's ask).
 *
 * ## Why this one is a client island when the ticker is not
 *
 * The ticker is one CSS animation over a track whose length is known at
 * render: the marquee's own keyframes, reused verbatim. A rotator cannot be
 * written that way for an arbitrary number of lines — each line's in, hold and
 * out are percentages of one shared keyframe, and those percentages depend on
 * how many lines there are, which CSS has no way to take as a parameter. The
 * alternatives were generating a keyframe block per install into an inline
 * `<style>`, or this. This is the one that stays readable.
 *
 * ## How long a line stays
 *
 * Long enough to read it, which is a function of the line rather than a
 * constant: ~15 characters a second is a comfortable silent reading pace, and
 * a line needs a moment either side of that to arrive and to be noticed. So
 * the hold is `1.4s + chars/15`, floored at 3s so a two-word line does not
 * blink past and capped at 9s so a long one does not read as a bar that has
 * stopped working. A single line does not rotate at all — there is nothing to
 * rotate to, and a timer that fires for ever to swap a line with itself is a
 * page that never goes idle.
 *
 * The rise itself is `--duration-drift`, 900ms, which is the token added for
 * it (2026-09-23, the client asked for "smooth and slow"). The four durations
 * in the scale all time a reaction to something somebody did; at `slow` this
 * read as a flick, and on a loop nobody triggered a flick is a distraction.
 * The hold is measured from the moment the line lands, so a slower rise does
 * not eat into the time there is to read it.
 *
 * ## What it does not do
 *
 * It does not animate under `prefers-reduced-motion`, and nothing here has to
 * check for that: the movement is a CSS transition, which the global rule in
 * `globals.css` already disables, so the line swaps instantly and every line is
 * still shown. The hidden state is on the lines that are *not* current, so
 * nothing is left stuck at `opacity: 0` — the trap that rule creates.
 *
 * It is also **invisible to a screen reader**: the whole stack is
 * `aria-hidden`, and `AnnouncementBar` renders the complete message once in an
 * `sr-only` element beside it. A rotator read aloud is either a live region
 * interrupting somebody every few seconds or a message of which only one line
 * is ever in the accessibility tree; a static copy of the whole thing is
 * neither.
 *
 * The HTML is written with `dangerouslySetInnerHTML` from the same value
 * `AnnouncementBar` renders, cleaned by the API's `inline` purifier profile on
 * write — emphasis and links, no style, no blocks. Sanitising at the sink here
 * would be a second implementation of that allowlist on the far side of the
 * wire; the boundary is where it is written, which is this project's rule for
 * every rich-text field.
 */
export function AnnouncementRotator({ lines, className }: { lines: string[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  const count = lines.length;

  useEffect(() => {
    if (count < 2 || paused) return;

    const chars = lines[index].replace(/<[^>]+>/g, "").trim().length;
    const hold = Math.min(9000, Math.max(3000, 1400 + (chars / 15) * 1000));
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), hold);

    return () => window.clearTimeout(timer);
  }, [index, count, paused, lines]);

  /*
   * Paused while the tab is hidden, so a bar does not run through twelve lines
   * nobody is looking at and come back mid-sentence — the rule every carousel
   * here follows, and the reason `useDocumentHidden` exists for the four that
   * share `use-carousel.ts`. This one keeps its own listener: it has no
   * autoplay state to merge with, and a hook returning a boolean read during
   * render is what `react-hooks/set-state-in-effect` refuses.
   */
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    /*
      A grid with every line in the same cell, not absolute positioning: the
      band then sizes itself to the tallest line instead of collapsing to
      nothing and needing a height nobody can know — a two-word line and one
      that wraps at 320px are different heights, and the bar sits above the
      header where a height that is wrong by a line moves the whole page.

      `items-center` on the grid and on the band around it: the line is one
      row in a band that is taller than it by design, and a line sitting on the
      band's top edge reads as a bar that has been cut off rather than as a
      slim one (the client, 2026-09-23).

      Pausing under the pointer and while something inside has focus, the
      ticker's two rules: a line carrying a link must not slide out from under
      the cursor going for it.
    */
    <div
      ref={host}
      aria-hidden="true"
      className={cn("grid items-center overflow-hidden", className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(document.hidden)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(document.hidden)}
    >
      {lines.map((html, i) => (
        <div
          key={i}
          // Never a tab stop: a link in a line nobody can see is a focus that
          // lands on nothing, and the readable copy of the message is the
          // `sr-only` one beside this stack.
          inert
          className={cn(
            // `truncate`, so every line is one line and the band is the same height
            // whatever an editor typed — the rule the fixed style follows too.
            "[grid-area:1/1] min-w-0 truncate text-center transition-[translate,opacity] duration-(--duration-drift) ease-brand",
            "[&_p]:inline [&_p+p]:ml-3 [&_a]:font-semibold [&_a]:text-inherit [&_a]:underline [&_a]:underline-offset-2",
            "[&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic [&_i]:italic [&_u]:underline [&_s]:line-through",
            "[&_sub]:align-sub [&_sub]:text-[0.8em] [&_sup]:align-super [&_sup]:text-[0.8em]",
            i === index
              ? "translate-y-0 opacity-100"
              : // Above the band once it has been read, below it while it waits:
                // the line rises, which is the whole of the effect.
                i === (index - 1 + count) % count
                ? "-translate-y-full opacity-0"
                : "translate-y-full opacity-0",
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ))}
    </div>
  );
}
