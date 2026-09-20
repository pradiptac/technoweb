"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A product card's picture, cycling through the other views while the card
 * is hovered.
 *
 * A product with a close-up and a detail shot used to show the first of them
 * and nothing said the others existed until the page was opened. Now resting
 * on the card walks through them — one every 1.1s, crossfading — and leaving
 * puts the first back, so a grid somebody has swept a pointer across looks
 * exactly as it did before. Keyboard focus anywhere in the card does the same
 * as the pointer, or the feature would exist for a mouse only.
 *
 * **Only the first image is in the DOM until the card is hovered.** The
 * others sit at `opacity: 0` in a well that is on screen, so `loading="lazy"`
 * would fetch them anyway — two extra photographs for every card in a
 * 24-card grid, for a hover most of them never get. They mount on the first
 * hover; the first crossfade is 1.1s later, which is enough for a card-sized
 * JPEG to arrive.
 *
 * The listeners go on the **card** — `closest("article")` — rather than on
 * the well, because "mouse over the product" means the whole card, and the
 * well is inside a link that is not the card's only control.
 *
 * Nothing here changes a computed colour, so the audit sees a still image;
 * under reduced motion the global rule removes the transition and the
 * pictures swap rather than fade, which is a change the person asked for by
 * pointing at the card.
 */
export function CardImages({
  images, alts, sizes, priority = false,
}: {
  images: string[];
  alts?: (string | null)[];
  sizes: string;
  priority?: boolean;
}) {
  const well = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const card = well.current?.closest("article");
    if (!card || images.length < 2) return;

    const start = () => {
      if (timer.current) return;
      setArmed(true);
      timer.current = setInterval(() => setIndex((i) => (i + 1) % images.length), 1100);
    };
    const stop = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setIndex(0);
    };
    // `focusout` fires between two controls inside the card too; the next
    // `focusin` restarts it a tick later, which is invisible at 1.1s a step.
    card.addEventListener("mouseenter", start);
    card.addEventListener("mouseleave", stop);
    card.addEventListener("focusin", start);
    card.addEventListener("focusout", stop);
    return () => {
      stop();
      card.removeEventListener("mouseenter", start);
      card.removeEventListener("mouseleave", stop);
      card.removeEventListener("focusin", start);
      card.removeEventListener("focusout", stop);
    };
  }, [images.length]);

  const shown = armed ? images : images.slice(0, 1);

  return (
    <div ref={well} className="absolute inset-0">
      {shown.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt={i === 0 ? alts?.[0] ?? "" : ""}
          fill
          sizes={sizes}
          priority={priority && i === 0}
          aria-hidden={i !== index || undefined}
          className={cn(
            "object-cover transition-[opacity,scale] duration-500 group-hover:scale-[1.03]",
            i === index ? "opacity-100" : "opacity-0",
          )}
        />
      ))}

      {/*
        Which view is showing, for a card with more than one. Dots rather than
        a count, and only while the card is hovered — at rest a card should
        look like a card, not a carousel. Not controls: `aria-hidden`, 6px,
        nothing to press.
      */}
      {images.length > 1 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5 opacity-0 transition-opacity duration-(--duration-slow) group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {images.map((src, i) => (
            <i
              key={src}
              className={cn(
                "size-1.5 rounded-full border border-dark/40 transition-colors duration-(--duration-slow)",
                i === index ? "bg-white" : "bg-white/50",
              )}
            />
          ))}
        </span>
      )}
    </div>
  );
}
