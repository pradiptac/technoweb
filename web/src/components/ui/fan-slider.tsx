"use client";

import { useCallback, useState, type CSSProperties } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useAutoplay, useDocumentHidden, useMotionOk, wrapIndex } from "@/lib/hooks/use-carousel";
import type { Slider as SliderData } from "@/types/api";
import { Slider } from "@/components/ui/slider";
import { Chevron, PlayPause } from "@/components/ui/slider-controls";

/**
 * The fanned photo gallery — `SliderLayout::Fan`.
 *
 * The reference (sent by the client on 2026-09-16) is a small card of a
 * component: a frame counter along the top in a mono face, the pictures
 * fanned in perspective with the current one square-on in front and the
 * others turned away behind it on either side, the heading and its caption
 * *under* the picture on the panel's own ground, and a pill at the foot
 * holding two arrows and a row of dots with the current one drawn long.
 * The words are never on the photograph, so their contrast is the panel's —
 * the same call the gallery's captions make.
 *
 * Every picture is one absolutely positioned card, keyed by slide, placed by
 * its **offset** from the current index: `translate`, `rotate` and `filter`
 * are computed from that one number and *transitioned*, so a press moves
 * every card to its new slot at once and the pressed one turns to face the
 * front — the mechanism `CardsSlider` argues for over reordering the DOM.
 * Offsets beyond ±3 sit fully behind the centre and invisible; the ring is
 * short-circuited so a slider of ten still fans symmetrically around the
 * current picture. Transform, opacity and filter only: nothing lays out on
 * a tick, and the stage clips, so nothing can widen the document. Under
 * reduced motion the transitions do not run (the global rule) and the cards
 * simply take their places.
 *
 * Sized from the container like `CardsSlider`: the card is `--card-w`, a
 * proportion of the well clamped between 120 and 360px, and the well takes
 * the caller's aspect ratio with a `min-height` under it so the counter,
 * the card, the words and the pill always fit — measured at 320px rather
 * than reasoned. A video or YouTube slide shows its poster; this is a
 * gallery of stills, and the card it links to still plays it. Needs two
 * slides, or it renders the ordinary `Slider`.
 */
const SPREAD = 3;

export function FanSlider({
  slider, className, aspect = "aspect-[4/3]", priority = false,
}: {
  slider: SliderData;
  className?: string;
  aspect?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const slides = slider.slides ?? [];
  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const motionOk = useMotionOk();
  const hidden = useDocumentHidden();
  const [override, setOverride] = useState<boolean | null>(null);

  const goTo = useCallback((next: number) => setIndex(wrapIndex(next, count)), [count]);

  const wantsPlay = override ?? slider.autoplay;
  const autoplay = wantsPlay && motionOk && !paused && !hidden && count > 1;
  const advance = useCallback(() => goTo(index + 1), [goTo, index]);
  useAutoplay(autoplay, slider.interval_ms, advance);

  if (count === 0) return null;
  if (count < 2) return <Slider slider={slider} className={className} aspect={aspect} priority={priority} />;

  const current = slides[index];
  const frame = String(index + 1).padStart(2, "0");
  const total = String(count).padStart(2, "0");

  return (
    <div className={cn("min-w-0 @container", className)}>
      <section
        aria-roledescription="carousel"
        aria-label={slider.name}
        className={cn(
          "group relative flex w-full min-w-0 flex-col overflow-clip rounded-xl border border-line-strong bg-surface",
          aspect,
          // The counter, the card, two lines of words and the pill, whatever
          // the ratio asks for — `min-height` beats `aspect-ratio`.
          "min-h-[calc(var(--card-h)_+_11.5rem)]",
        )}
        style={{
          // 42% of the well: the fan of five then spans ~90% of it. Measured
          // at 30% the current picture was 160px in a 533px hero column.
          "--card-w": "clamp(120px, 42cqw, 360px)",
          "--card-h": "calc(var(--card-w) * 1.15)",
        } as CSSProperties}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
        }}
      >
        {/* `pr-12` keeps the counter clear of the pause button in the corner. */}
        <div className={cn("flex items-baseline justify-between px-4 pt-3.5 font-mono text-11 uppercase tracking-[.08em] text-muted", slider.autoplay && "pr-12")}>
          <span>Frame {frame}</span>
          <span aria-hidden>{frame} / {total}</span>
        </div>

        {/* The stage: a perspective the cards are placed in. */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center py-4 [perspective:1100px]">
          <div className="relative h-[var(--card-h)] w-[var(--card-w)] [transform-style:preserve-3d]">
            {slides.map((slide, i) => {
              // The shortest way round the ring, so the fan is symmetric.
              let offset = i - index;
              if (offset > count / 2) offset -= count;
              if (offset < -count / 2) offset += count;
              const away = Math.abs(offset);
              const shown = away <= SPREAD;
              const thumb = slide.kind === "image" ? slide.url : slide.poster_url;
              const isCurrent = offset === 0;
              const picture = thumb ? (
                <Image
                  src={thumb}
                  alt={isCurrent ? slide.alt ?? "" : ""}
                  fill
                  sizes="320px"
                  priority={priority && i === 0}
                  className="object-cover"
                />
              ) : (
                <span aria-hidden className="grid h-full w-full place-items-center text-muted">
                  <Chevron />
                </span>
              );
              const classes = cn(
                "absolute inset-0 overflow-hidden rounded-xl bg-surface-2 shadow-3 ring-1 ring-line-strong",
                "transition-[translate,rotate,filter,opacity,scale] duration-(--duration-slow) ease-brand",
              );
              // Each step back slides the card out by ~55% of its width, turns
              // it 12° away and drops it 6% in size — all from the one number,
              // so a card passing through the middle turns to face front on
              // the way.
              const place: CSSProperties = {
                translate: `calc(${offset} * 55%) 0 calc(${-away} * 60px)`,
                rotate: `y ${-offset * 12}deg`,
                scale: shown ? String(1 - away * 0.06) : "0.8",
                filter: `brightness(${1 - away * 0.14}) saturate(${1 - away * 0.15})`,
                // The others fade with distance (asked for 2026-09-17: "except
                // the highlighted image, the others should be faded").
                opacity: shown ? [1, 0.55, 0.3, 0.15][away] : 0,
                zIndex: SPREAD + 1 - away,
              };
              // One element type for every card, whatever its slot: a card
              // that changed from a <div> to a <button> on becoming current
              // would remount, and a remounted element transitions from
              // nowhere. The current one is marked and kept out of the tab
              // order; the arrows and the dots are the controls that move.
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={isCurrent ? `Slide ${i + 1} of ${count}${slide.heading ? `: ${slide.heading}` : ""}` : `Show slide ${i + 1}${slide.heading ? `: ${slide.heading}` : ""}`}
                  aria-current={isCurrent || undefined}
                  aria-hidden={!shown || undefined}
                  tabIndex={shown && !isCurrent ? 0 : -1}
                  className={cn(classes, isCurrent ? "cursor-default" : "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500")}
                  style={place}
                >
                  {picture}
                </button>
              );
            })}
          </div>
        </div>

        {/* The words, under the picture — always rendered at one height so the
            stage above never moves between a captioned slide and a bare one. */}
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

        {/* The pill: arrows either side of the dots. */}
        <div className="flex justify-center px-4 pt-3 pb-4">
          <div className="flex max-w-full items-center gap-1 rounded-full bg-card px-1.5 py-1 shadow-2 ring-1 ring-line">
            <button type="button" onClick={() => goTo(index - 1)} aria-label="Previous slide" className="grid size-7 place-items-center rounded-full text-ink-2 transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-ink">
              <Chevron className="size-4 rotate-180" />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-1.5 px-1">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  onClick={() => goTo(i)}
                  // 24px of hit area around the dot — the banner slider's rule.
                  className="grid size-6 place-items-center"
                >
                  <span aria-hidden className={cn("block h-1.5 rounded-full transition-[width,background-color] duration-(--duration-base)", i === index ? "w-5 bg-ink" : "w-1.5 bg-line-strong")} />
                </button>
              ))}
            </div>
            <button type="button" onClick={() => goTo(index + 1)} aria-label="Next slide" className="grid size-7 place-items-center rounded-full text-ink-2 transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-ink">
              <Chevron className="size-4" />
            </button>
          </div>
        </div>

        {slider.autoplay && (
          <PlayPause playing={wantsPlay} onToggle={() => setOverride(!wantsPlay)} className="top-2 right-2" />
        )}

        <p className="sr-only" aria-live="polite">
          Slide {index + 1} of {count}
        </p>
      </section>
    </div>
  );
}
