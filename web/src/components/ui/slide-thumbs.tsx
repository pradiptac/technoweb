"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Slide } from "@/types/api";

/**
 * The `thumbnails` navigation: a strip of small pictures under the slider, in
 * place of the dots.
 *
 * It scrolls inside its own box (`w-0 min-w-full`, so a long strip contributes
 * nothing to the width of whatever holds it) and follows the current slide by
 * scrolling that box — never `scrollIntoView`, which would move the page too.
 */
export function SlideThumbs({ slides, index, onGo, smooth }: {
  slides: Slide[];
  index: number;
  onGo: (i: number) => void;
  smooth: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = strip.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!el || !current) return;
    el.scrollTo({ left: current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" });
  }, [index, smooth]);

  return (
    // In flow under the picture, on the page's own ground (not over the scrim).
    <div className="shrink-0">
      <div ref={strip} className="relative w-0 min-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* `p-1` leaves room for the active ring, which the scroll box would otherwise clip. */}
        <div className="mx-auto flex w-max gap-1.5 p-1">
          {slides.map((slide, i) => {
            const src = slide.kind === "image" ? slide.url : slide.poster_url;
            const label = slide.heading || slide.alt;
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => onGo(i)}
                aria-label={label ? `Slide ${i + 1}: ${label}` : `Slide ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "relative block h-10 w-16 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:h-12 sm:w-20",
                  "ring-2 transition-opacity duration-(--duration-fast)",
                  i === index ? "opacity-100 ring-brand-500" : "opacity-70 ring-transparent hover:opacity-100",
                )}
              >
                {src && <Image src={src} alt="" fill sizes="96px" className="object-cover" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
