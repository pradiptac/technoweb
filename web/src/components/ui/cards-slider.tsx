"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Slider as SliderData } from "@/types/api";
import { Slider, SlideMedia, SlideCaption, Chevron, PlayPause, arrow, captionAnimationFor } from "@/components/ui/slider";

/**
 * The stacked-cards carousel — `SliderLayout::Cards`.
 *
 * The current slide fills the well with its caption, the same as `full`; the
 * other slides wait as a row of small cards over the bottom-right, and
 * pressing one brings it forward while the picture it replaces joins the end
 * of the row. A component of its own rather than a fourth branch inside
 * `Slider`, for the reason `StoreHero` gives: it is a different *shape*, not
 * a different transition, and `Slider`'s docblock already argues against
 * growing another mechanism. It borrows `Slider`'s media, caption and arrow
 * pieces so the per-`kind` branches still exist in one place.
 *
 * **The reference for this is a DOM-reordering snippet — `appendChild` the
 * first item on click and let CSS transitions on `left`, `width` and `height`
 * carry it — and that mechanism was deliberately not kept.** Those are layout
 * properties: every frame is a reflow of the well and everything in it, which
 * the motion rules this site follows rule out, and React owns the DOM order
 * here anyway. The same effect is done in two transform-only halves. The
 * cards are absolutely positioned and keyed by slide, each placed by
 * `translate` from its slot number, so a card changing slot *transitions*
 * there rather than being moved. And the promoted picture is a FLIP: the
 * pressed card's box is measured before the swap, the well's after it, and
 * the incoming media is animated with the Web Animations API from
 * "translate and scale to where the card was" to nothing — the card growing
 * into the background, on the compositor, interruptible by the next press
 * because the running animation is cancelled first. Under reduced motion
 * neither half runs and the swap is instant; there is no keyframe in
 * `globals.css` to guard because there is no keyframe.
 *
 * **Sized from the container, not the viewport.** The well is a `@container`
 * and the card width is `12cqw` clamped between 64 and 160px, so the row is
 * the same proportion of a shortcode in a content column, the shop's wide
 * banner and the homepage hero's half-width column. Below `@md` the row runs
 * along the bottom and the caption is kept above it; from `@md` the row keeps
 * to the right and the caption keeps to the left — either way the words and
 * the cards never share a pixel, which `npm run audit:mobile` at 320px is
 * what checks. Three cards are real; a fourth is rendered as a peek past the
 * edge, `aria-hidden` and out of the tab order, because a control somebody
 * can focus and not see is worse than one that is not there. `overflow-clip`
 * rather than `overflow-hidden` on the well for that reason too: a focused
 * element inside `overflow: hidden` scrolls its container to reveal itself,
 * and the well must never scroll.
 *
 * Needs two slides — one slide has no cards — so anything less renders the
 * ordinary `Slider`.
 */
const FLIP_MS = 600;
const SETTLE_MS = 700;
const PEEK_SLOT = 3;

export function CardsSlider({
  slider, className, aspect = "aspect-[4/3]", priority = false, sizes = "100vw",
}: {
  slider: SliderData;
  className?: string;
  aspect?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const slides = slider.slides ?? [];
  const count = slides.length;
  const captionAnimation = captionAnimationFor(slider);

  const well = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<number, HTMLButtonElement>());
  /** The pressed card's box, measured before the swap, for the FLIP after it. */
  const flipFrom = useRef<DOMRect | null>(null);

  const [index, setIndex] = useState(0);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [motionOk, setMotionOk] = useState(false);
  const [override, setOverride] = useState<boolean | null>(null);
  const [painted, setPainted] = useState<Record<number, true>>({});
  const markPainted = useCallback((i: number) => {
    setPainted((prev) => (prev[i] ? prev : { ...prev, [i]: true }));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setMotionOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const goTo = useCallback((next: number) => {
    const target = ((next % count) + count) % count;
    if (target === index) return;
    // Measured now, while the card is still on screen: after the swap it is
    // the background and there is nothing left to measure.
    const id = slider.slides?.[target]?.id;
    flipFrom.current = id === undefined ? null : cards.current.get(id)?.getBoundingClientRect() ?? null;
    setOutgoing(index);
    setIndex(target);
  }, [count, index, slider.slides]);

  useEffect(() => {
    if (outgoing === null) return;
    const timer = setTimeout(() => setOutgoing(null), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [outgoing, index]);

  /*
    The FLIP, in a layout effect so it starts before the swapped slide is
    painted at full size — an effect would show one frame of the finished
    state and then jump back to the card to grow from it.
  */
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    const el = media.current;
    const box = well.current;
    if (!from || !el || !box || !motionOk) return;
    const to = box.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const ease = getComputedStyle(document.documentElement).getPropertyValue("--ease-brand").trim() || "ease-out";
    const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      [{ transform: start, borderRadius: "12px" }, { transform: "none", borderRadius: "0px" }],
      // `backwards`, not `both`: once it has finished the element's own
      // (empty) transform stands, and `getAnimations()` reports nothing —
      // a forward-filling animation would hold the element for ever.
      { duration: FLIP_MS, easing: ease, fill: "backwards" },
    );
    // The words wait for the picture to be most of the way there, or they
    // sit at full size over a card still growing under them.
    const cap = caption.current;
    if (cap) {
      cap.getAnimations().forEach((a) => a.cancel());
      cap.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: FLIP_MS, easing: "ease-out", fill: "backwards" });
    }
  }, [index, motionOk]);

  const wantsPlay = override ?? slider.autoplay;
  const autoplay = wantsPlay && motionOk && !paused && count > 1;
  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => goTo(index + 1), Math.max(2000, slider.interval_ms));
    return () => clearInterval(id);
  }, [autoplay, index, slider.interval_ms, goTo]);

  if (count === 0) return null;
  if (count < 2) return <Slider slider={slider} className={className} aspect={aspect} priority={priority} sizes={sizes} />;

  // The others, in ring order after the current one; at most the three real
  // cards and the peek.
  const others = Array.from({ length: Math.min(count - 1, PEEK_SLOT + 1) }, (_, k) => (index + 1 + k) % count);
  const current = slides[index];
  // The slide most likely to come next — the first card, the arrow, the
  // autoplay — decoded before its turn, the rule `Slider` follows for its
  // neighbours: mounted at full size and invisible. Without it the promoted
  // picture decodes during the FLIP, and the frame the card should be growing
  // through is spent decoding a hero-sized image instead. The card's own
  // thumbnail is a 160px variant and does not help.
  const next = (index + 1) % count;

  return (
    /*
      The container is a wrapper, not the well. A container query answers
      for the nearest *ancestor* container, never for the element that
      declares `@container` — so a `@max-md:` on the well itself could never
      match, and did not: the first cut put both on one element and the
      min-height below silently never applied.
    */
    <div className={cn("min-w-0 @container", className)}>
    <section
      ref={well}
      aria-roledescription="carousel"
      aria-label={slider.name}
      className={cn(
        // `w-full` is load-bearing beside the `min-height` below. With the
        // width left `auto`, CSS transfers a minimum height *through* the
        // aspect ratio into a minimum width — 253px tall at 16:9 became a
        // 450px-wide well inside a 288px column, with the card row off the
        // right of a 320px screen. An explicit width stops the transfer, and
        // the ratio then only ever derives the height.
        "group relative w-full min-w-0 overflow-clip rounded-xl border border-line-strong bg-dark",
        aspect,
        // Below `@md` the row sits under the words, and a 16:9 well 288px wide
        // is 162px tall — the row and its inset take 101 of them and the
        // heading is pushed out of the top. `min-height` beats `aspect-ratio`,
        // so the well grows only where it has to: the row, plus room for a
        // two-line heading and three lines of caption. Measured at 320px, not
        // reasoned: the first cut passed the "caption box ends above the
        // cards" check with the heading clipped clean off.
        "@max-md:min-h-[calc(var(--card-h)_+_2_*_var(--card-inset)_+_9.5rem)]",
      )}
      style={{
        "--card-w": "clamp(64px, 12cqw, 160px)",
        "--card-h": "calc(var(--card-w) * 4 / 3)",
        "--card-gap": "clamp(6px, 1cqw, 12px)",
        "--card-inset": "clamp(8px, 2.5cqw, 24px)",
        "--card-row": "calc(3 * var(--card-w) + 2 * var(--card-gap))",
      } as CSSProperties}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
    >
      {next !== index && next !== outgoing && (
        <div key={`s-${next}`} aria-hidden className="invisible absolute inset-0">
          <SlideMedia
            sizes={sizes}
            slide={slides[next]}
            autoplay={false}
            eager
            priority={false}
            placeholder={false}
            painted={Boolean(painted[next])}
            onPaint={() => markPainted(next)}
          />
        </div>
      )}

      {/* The picture on its way out stays put, opaque, under the one arriving. */}
      {outgoing !== null && outgoing !== index && (
        <div key={`s-${outgoing}`} aria-hidden className="pointer-events-none absolute inset-0">
          <SlideMedia
            sizes={sizes}
            slide={slides[outgoing]}
            autoplay={false}
            eager
            priority={false}
            placeholder={false}
            painted={Boolean(painted[outgoing])}
            onPaint={() => markPainted(outgoing)}
          />
        </div>
      )}

      <div
        key={`s-${index}`}
        ref={media}
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${count}`}
        className="absolute inset-0 origin-top-left overflow-hidden"
      >
        <SlideMedia
          sizes={sizes}
          slide={current}
          autoplay={autoplay}
          eager
          priority={priority && index === 0}
          placeholder={outgoing === null}
          painted={Boolean(painted[index])}
          onPaint={() => markPainted(index)}
        />
      </div>

      {/*
        The caption's box stops where the cards begin: above the row below
        `@md`, left of it from `@md`. `SlideCaption` fills whatever box it is
        given and anchors inside it, so each slide's own anchor still holds.
      */}
      <div
        key={`c-${index}`}
        ref={caption}
        className="absolute inset-0 bottom-[calc(var(--card-h)_+_2_*_var(--card-inset))] @md:right-[calc(var(--card-row)_+_2_*_var(--card-inset))] @md:bottom-0"
      >
        <SlideCaption slide={current} animation={captionAnimation} />
      </div>

      <div
        className="absolute bottom-[var(--card-inset)] right-[var(--card-inset)] h-[var(--card-h)] w-[var(--card-row)]"
      >
        {others.map((i, k) => {
          const slide = slides[i];
          const peek = k === PEEK_SLOT;
          const thumb = slide.kind === "image" ? slide.url : slide.poster_url;
          return (
            <button
              key={slide.id}
              ref={(el) => {
                if (el) cards.current.set(slide.id, el);
                else cards.current.delete(slide.id);
              }}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show slide ${i + 1}${slide.heading ? `: ${slide.heading}` : ""}`}
              aria-hidden={peek || undefined}
              tabIndex={peek ? -1 : 0}
              className={cn(
                "absolute left-0 top-0 h-[var(--card-h)] w-[var(--card-w)] overflow-hidden rounded-xl bg-dark-2",
                "shadow-2 ring-1 ring-white/25 transition-[translate,scale] duration-500 ease-brand",
                "hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
                "motion-reduce:transition-none motion-reduce:hover:scale-100",
              )}
              // The slot decides where a card sits; a card whose slot changes
              // slides there, because `translate` is what is transitioned.
              style={{ translate: `calc(${k} * (var(--card-w) + var(--card-gap))) 0` }}
            >
              {thumb ? (
                <Image src={thumb} alt="" fill sizes="160px" className="object-cover" />
              ) : (
                <span aria-hidden className="grid h-full w-full place-items-center text-white/70">
                  <Chevron />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button type="button" onClick={() => goTo(index - 1)} aria-label="Previous slide" className={arrow("left-2")}>
        <Chevron className="rotate-180" />
      </button>
      <button type="button" onClick={() => goTo(index + 1)} aria-label="Next slide" className={arrow("right-2")}>
        <Chevron />
      </button>

      {slider.autoplay && (
        // Bottom-left, because the card row owns the bottom-right corner.
        <PlayPause playing={wantsPlay} onToggle={() => setOverride(!wantsPlay)} className="bottom-2 left-2" />
      )}

      <p className="sr-only" aria-live="polite">
        Slide {index + 1} of {count}
      </p>
    </section>
    </div>
  );
}
