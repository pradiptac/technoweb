"use client";

import { useCallback, useState, type CSSProperties } from "react";
import Image from "next/image";
import { focalStyle } from "@/lib/focal";
import { cn } from "@/lib/utils";
import { useAutoplay, useDocumentHidden, useMotionOk, wrapIndex } from "@/lib/hooks/use-carousel";
import type { Slider as SliderData } from "@/types/api";
import { Slider } from "@/components/ui/slider";
import { Chevron, PlayPause } from "@/components/ui/slider-controls";

/**
 * The cylinder carousel — `SliderLayout::Cylinder` (the client, 2026-09-24,
 * after Vengeance UI's cylinder carousel, MIT; re-drawn, not vendored).
 *
 * The slides stand as cards around a ring seen in perspective, the current
 * one square-on in front. The reference spins continuously on a keyframe;
 * this one **turns one card per step** — autoplay, the arrows, the dots or
 * a press on a card — because a ring that is always mid-turn has no front
 * card, and the heading and caption under it need one to belong to.
 *
 * ## The geometry, and the one ordering trap
 *
 * Each card is `transform: rotateY(i·360/n) translateZ(r)` — turned to its
 * slot, then pushed out along its own new facing. That has to be the
 * `transform` *function list*: the individual `rotate` and `translate`
 * properties compose as translate ∘ rotate ∘ scale, which would push every
 * card out along the same axis before turning it. The ring itself turns
 * with the **`rotate`** property, which is what is transitioned (never
 * `transition-transform` — the v4 trap), and it is pushed back by `r` with
 * `translate`, which applies after the turn, so it turns about its own
 * centre. The step counter is unbounded — `step`, not the wrapped index —
 * so going from the last card to the first turns forward one card rather
 * than spinning back through all of them.
 *
 * `r` is the card width over `2·tan(π/n)` with a little air, so the cards
 * meet edge to edge at any count; the card width is a share of the
 * container, clamped. The stage clips (`overflow-clip`), so the ring can
 * never widen the page; cards facing away are hidden by
 * `backface-visibility` and dimmed by distance. Under reduced motion the
 * transition does not run (the global rule) and the ring simply faces the
 * chosen card. Needs five slides — fewer is not a cylinder — or it renders
 * the ordinary `Slider`.
 */
export function CylinderSlider({
  slider, className, aspect = "aspect-[16/9]", priority = false,
}: {
  slider: SliderData;
  className?: string;
  aspect?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const slides = slider.slides ?? [];
  const count = slides.length;

  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const motionOk = useMotionOk();
  const hidden = useDocumentHidden();
  const [override, setOverride] = useState<boolean | null>(null);
  const index = wrapIndex(step, Math.max(1, count));

  // The shortest way round to slide `i`, as a change of the unbounded step.
  const goTo = useCallback((i: number) => {
    setStep((s) => {
      const from = wrapIndex(s, count);
      let delta = i - from;
      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;
      return s + delta;
    });
  }, [count]);
  const turn = useCallback((by: number) => setStep((s) => s + by), []);

  const wantsPlay = override ?? slider.autoplay;
  const autoplay = wantsPlay && motionOk && !paused && !hidden && count >= 5;
  const advance = useCallback(() => turn(1), [turn]);
  useAutoplay(autoplay, slider.interval_ms, advance);

  if (count === 0) return null;
  if (count < 5) return <Slider slider={slider} className={className} aspect={aspect} priority={priority} />;

  const angle = 360 / count;
  // Card width / (2·tan(π/n)), with 6% air between neighbours.
  const radiusFactor = (1 / (2 * Math.tan(Math.PI / count))) * 1.06;
  const current = slides[index];

  return (
    <div className={cn("min-w-0 @container", className)}>
      <section
        aria-roledescription="carousel"
        aria-label={slider.name}
        className={cn(
          "group relative flex w-full min-w-0 flex-col overflow-clip rounded-xl border border-line-strong bg-card",
          aspect,
          "min-h-[calc(var(--card-h)_+_10rem)]",
        )}
        style={{
          "--card-w": "clamp(120px, 26cqw, 280px)",
          "--card-h": "calc(var(--card-w) * 1.25)",
          "--r": `calc(var(--card-w) * ${radiusFactor.toFixed(4)})`,
        } as CSSProperties}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
        }}
      >
        <div className="relative flex min-h-0 flex-1 items-center justify-center py-6 [perspective:1400px]">
          <div
            className="relative h-[var(--card-h)] w-[var(--card-w)] [transform-style:preserve-3d] transition-[rotate] duration-(--duration-drift) ease-brand"
            style={{ translate: "0 0 calc(-1 * var(--r))", rotate: `y ${-step * angle}deg` }}
          >
            {slides.map((slide, i) => {
              let offset = i - index;
              if (offset > count / 2) offset -= count;
              if (offset < -count / 2) offset += count;
              const away = Math.abs(offset);
              const isCurrent = offset === 0;
              const thumb = slide.kind === "image" ? slide.url : slide.poster_url;
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={isCurrent ? `Slide ${i + 1} of ${count}${slide.heading ? `: ${slide.heading}` : ""}` : `Show slide ${i + 1}${slide.heading ? `: ${slide.heading}` : ""}`}
                  aria-current={isCurrent || undefined}
                  // Only the near neighbours are reachable; the rest face away.
                  tabIndex={away === 1 ? 0 : -1}
                  aria-hidden={away > 1 || undefined}
                  className={cn(
                    "absolute inset-0 overflow-hidden rounded-xl bg-surface-2 shadow-3 ring-1 ring-line-strong [backface-visibility:hidden]",
                    "transition-[filter,opacity] duration-(--duration-drift) ease-brand",
                    isCurrent ? "cursor-default" : "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  )}
                  style={{
                    transform: `rotateY(${i * angle}deg) translateZ(var(--r))`,
                    filter: `brightness(${Math.max(0.45, 1 - away * 0.18)})`,
                    opacity: away > count / 2 - 0.5 ? 0.5 : 1,
                  }}
                >
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt={isCurrent ? slide.alt ?? "" : ""}
                      fill
                      sizes="280px"
                      priority={priority && isCurrent}
                      loading={away <= 1 ? "eager" : undefined}
                      className="object-cover"
                      style={focalStyle(slide.focus)}
                    />
                  ) : (
                    <span aria-hidden className="grid h-full w-full place-items-center text-muted"><Chevron /></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* The words for the front card, at one height so the ring never moves. */}
        <div key={index} className="gallery-fade min-h-[2.75rem] px-4 text-center">
          {current.heading && (
            current.link_url ? (
              <a href={current.link_url} className="text-14 font-semibold text-ink hover:text-brand-ink hover:underline">{current.heading}</a>
            ) : (
              <p className="text-14 font-semibold text-ink">{current.heading}</p>
            )
          )}
          {current.caption && <p className="mt-0.5 line-clamp-1 text-12 text-muted">{current.caption}</p>}
        </div>

        <div className="flex justify-center px-4 pt-3 pb-4">
          <div className="flex max-w-full items-center gap-1 rounded-full bg-card px-1.5 py-1 shadow-2 ring-1 ring-line">
            <button type="button" onClick={() => turn(-1)} aria-label="Previous slide" className="grid size-7 place-items-center rounded-full text-ink-2 transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-ink">
              <Chevron className="size-4 rotate-180" />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-1.5 px-1">
              {slides.map((s, i) => (
                <button key={s.id} type="button" aria-label={`Go to slide ${i + 1}`} aria-current={i === index} onClick={() => goTo(i)} className="grid size-6 place-items-center">
                  <span aria-hidden className={cn("block h-1.5 rounded-full transition-[width,background-color] duration-(--duration-base)", i === index ? "w-5 bg-ink" : "w-1.5 bg-line-strong")} />
                </button>
              ))}
            </div>
            <button type="button" onClick={() => turn(1)} aria-label="Next slide" className="grid size-7 place-items-center rounded-full text-ink-2 transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-ink">
              <Chevron className="size-4" />
            </button>
          </div>
        </div>

        {slider.autoplay && (
          <PlayPause playing={wantsPlay} onToggle={() => setOverride(!wantsPlay)} className="top-2 right-2" />
        )}

        <p className="sr-only" aria-live="polite">Slide {index + 1} of {count}</p>
      </section>
    </div>
  );
}
