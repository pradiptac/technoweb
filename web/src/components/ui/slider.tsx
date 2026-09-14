"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useAutoplay, useDocumentHidden, useMotionOk, wrapIndex } from "@/lib/hooks/use-carousel";
import type { Slider as SliderData } from "@/types/api";
import { SlideMedia } from "@/components/ui/slide-media";
import { SlideCaption, captionAnimationFor } from "@/components/ui/slide-caption";
import { Chevron, PlayPause, arrow } from "@/components/ui/slider-controls";

/**
 * A carousel built on CSS scroll-snap rather than a carousel library.
 *
 * The track is a real horizontally-scrollable element, so a touch swipe, a
 * trackpad gesture and a keyboard both work before any JavaScript runs, and
 * with JavaScript disabled the slides remain reachable by scrolling instead of
 * becoming an unreachable stack. The buttons and dots drive `scrollTo` on that
 * same element — they are a convenience over the native behaviour, not the
 * mechanism.
 *
 * Two things this has to get right for the audits:
 *
 * The track is `overflow-x-auto`, which *contains* its overflow — a 3x-wide
 * strip of slides inside it does not widen the document, so it cannot trip the
 * zero-tolerance horizontal-overflow check. This is the same reason the admin
 * tables pass.
 *
 * Autoplay never starts under `prefers-reduced-motion: reduce`. Vestibular
 * triggers aside, content that moves on its own is the thing that setting most
 * obviously means, and a carousel that ignores it is the clearest possible
 * failure of it. It also stops while the pointer is over the slider, while
 * focus is inside it, and while the tab is hidden — advancing a slide someone
 * is reading is worse than not advancing at all.
 *
 * **`transition` picks between two different mechanisms, not four variations
 * on one.** `slide` (the default) is everything above — a real scrollable
 * strip, because that already was the whole design before this column
 * existed, and every slider on every existing install must not change
 * behaviour under it the moment the migration ran. `fade`, `zoom` and `none`
 * stack the slides in one box: the incoming one animates in **on top of**
 * the outgoing one, which stays exactly as it was, opaque and still, until
 * the transition ends and it is dropped. `goTo` chooses the mechanism
 * itself, from whether the native track is mounted: with no scrollable
 * element to scroll, it falls through to setting the index directly.
 *
 * Three things about that stack were each measured as a flicker before they
 * were rules (`scripts/_slider-flicker-probe.mjs` films a transition frame
 * by frame and reads the box's luminance):
 *
 * - **Every slide element is keyed on its slide, never on its role.** The
 *   first cut keyed the outgoing slide as `out-N` and the incoming as
 *   `in-N`, so the moment a slide became outgoing React tore its `<img>`
 *   down and made a new one — the picture that most needed to stay put was
 *   the one being recreated. With `s-N` keys the same element simply
 *   changes class.
 * - **The next and previous slides are mounted, invisible, before they are
 *   needed.** A `<img>` created at the moment it has to fade in has nothing
 *   to fade in with until the bytes arrive, and its placeholder — an opaque
 *   panel — sat *above* the outgoing photograph, so every transition opened
 *   with a light-grey flash for as long as the decode took (5 frames at
 *   1440px, measured). `visibility: hidden` loads and decodes; the slide is
 *   already there when its turn comes, and no placeholder is drawn while an
 *   outgoing slide is on screen to be covered.
 * - **The outgoing slide does not fade out.** Fading it while the incoming
 *   fades in put both at half opacity over the dark backdrop mid-way, a dip
 *   of ~9 luminance units below either photograph — visible as a dark blink
 *   in the middle of every crossfade. The incoming slide covers the box
 *   entirely, so the one underneath has nothing to do but stay.
 * - **The caption travels with its slide.** It used to be one overlay keyed
 *   on the index, drawn above the whole stack: the old scrim and words
 *   vanished the instant the index changed and the new scrim — an opaque
 *   dark gradient over most of the picture — appeared at once, so the frames
 *   after a click showed the old photograph abruptly dimmed while the DOM
 *   said its replacement was at 30% opacity. Each stacked slide is now one
 *   wrapper holding its photograph and its caption, and the wrapper is what
 *   animates in.
 *
 * The keyframes are its own (`slide-fade-in`, `slide-zoom-in` in
 * `globals.css`) rather than `Gallery`'s: those run at 320ms, which suits a
 * lightbox someone is clicking through; a crossfade reads better slower, so
 * it has its own duration (`TRANSITION_MS`).
 */
const TRANSITION_MS = 700;
export function Slider({
  slider, className, aspect = "aspect-[4/3]", priority = false, sizes = "100vw",
}: {
  slider: SliderData;
  className?: string;
  /** The box every slide fills. Fixed, so nothing shifts as media loads. */
  aspect?: string;
  /** Eager-load the first slide — set this only for the one above the fold. */
  priority?: boolean;
  /**
   * How wide the box is, as the `sizes` attribute the optimiser picks a width
   * from. `100vw` is right for a shortcode in a content column and wrong for
   * the homepage hero, which is a column beside the copy from `lg` — left at
   * the default it downloaded a 1920px, 500KB WebP for a 640px box.
   */
  sizes?: string;
}) {
  const slides = slider.slides ?? [];
  const transition = slider.transition || "slide";
  const isNative = transition === "slide";
  const captionAnimation = captionAnimationFor(slider);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // Paused under the pointer and while anything inside has focus — a
  // courtesy, not a control; the Pause button is the control.
  const [paused, setPaused] = useState(false);
  /*
    Somebody's own decision about the autoplay, over the slider's setting —
    null until they press the button, the shape `Gallery`'s lightbox uses.
    Pausing on hover and focus is a courtesy; a visible control is what an
    auto-rotating region is required to offer, because a keyboard user with
    no pointer to hover has no other way to stop it.
  */
  const [override, setOverride] = useState<boolean | null>(null);
  /*
    The slide being crossfaded away from, for `fade`/`zoom` only — `null`
    once the transition has finished and only the current slide need render.

    Set in `goTo`, in the same batch as the index, and not in an effect that
    reacts to the index afterwards: an effect runs after the commit has
    painted, so for one frame the slide on its way out was not "outgoing"
    yet — it was a hidden neighbour, or unmounted — and the box showed the
    incoming slide at 0% over nothing. Rapid clicks crossfade from whatever
    is on screen, because the value written is the index at the click.
  */
  const [outgoing, setOutgoing] = useState<number | null>(null);
  /*
    Which slides have painted, so the placeholder under each can stop.

    Keyed by index rather than held as one "everything is ready" flag: slides
    load independently and out of order, and a single flag would either hold
    the placeholder over a slide that is ready or clear it from one that is
    not. Returning `prev` unchanged when the key is already set matters — the
    ref callback below fires on every render, and a fresh object each time
    would re-render forever.
  */
  const [painted, setPainted] = useState<Record<number, true>>({});
  const markPainted = useCallback((i: number) => {
    setPainted((prev) => (prev[i] ? prev : { ...prev, [i]: true }));
  }, []);

  const motionOk = useMotionOk();
  const hidden = useDocumentHidden();

  const goTo = useCallback((next: number, smooth = true) => {
    const target = wrapIndex(next, slides.length);
    const el = track.current;
    if (el) {
      el.scrollTo({ left: target * el.clientWidth, behavior: smooth && motionOk ? "smooth" : "auto" });
    } else {
      // No native track mounted — a `fade`/`zoom`/`none` slider has nothing
      // to scroll, so the index is the only thing that moves. The slide it
      // moves away from is kept, opaque, under the one arriving.
      if (target !== index && transition !== "none") setOutgoing(index);
      setIndex(target);
    }
  }, [slides.length, motionOk, index, transition]);

  // The scroll position is the source of truth for which slide is showing —
  // a swipe changes it without going through goTo, and an index kept
  // separately would disagree with what is on screen. A no-op when there is
  // no native track to listen to.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [isNative]);

  // Drops the outgoing slide once the incoming one has fully covered it.
  // Keyed on the index too, so a second click mid-transition re-arms the
  // timer for the new pair rather than dropping the new outgoing early.
  useEffect(() => {
    if (outgoing === null) return;
    const timer = setTimeout(() => setOutgoing(null), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [outgoing, index]);

  const wantsPlay = override ?? slider.autoplay;
  const autoplay = wantsPlay && motionOk && !paused && !hidden && slides.length > 1;
  const advance = useCallback(() => goTo(index + 1), [goTo, index]);
  useAutoplay(autoplay, slider.interval_ms, advance);

  if (slides.length === 0) return null;

  /*
    How far a slide is from the one on screen, the short way round.

    `goTo` wraps in both directions, so the slide before the first is the last
    one — and a plain `Math.abs(i - index)` calls that the furthest away
    instead of adjacent, which is precisely the slide someone reaches by
    pressing Previous on slide one. Only meaningful for the native track,
    where every slide is in the DOM at once.
  */
  const distance = (i: number) => {
    const d = Math.abs(i - index);
    return Math.min(d, slides.length - d);
  };

  const enterClass =
    transition === "zoom" ? "slide-zoom-in"
    : transition === "fade" ? "slide-fade-in"
    : ""; // "none", or a stored value the enum no longer knows — swap with no animation rather than throw.

  /*
    The stack for the non-native transitions, bottom to top: the neighbours
    (invisible, loading), the outgoing slide (opaque, still), the current one
    (animating in). Built as a list so React reconciles by slide key and a
    slide changing role keeps its element.
  */
  const stacked = (() => {
    if (isNative) return [];
    const n = slides.length;
    const wrap = (i: number) => ((i % n) + n) % n;
    const roles = new Map<number, "current" | "outgoing" | "neighbour">();
    if (n > 1) {
      roles.set(wrap(index - 1), "neighbour");
      roles.set(wrap(index + 1), "neighbour");
    }
    if (outgoing !== null && outgoing !== index) roles.set(outgoing, "outgoing");
    roles.set(index, "current");
    const order = { neighbour: 0, outgoing: 1, current: 2 };
    return [...roles.entries()].sort((a, b) => order[a[1]] - order[b[1]]);
  })();

  return (
    <section
      aria-roledescription="carousel"
      aria-label={slider.name}
      className={cn("group relative min-w-0 overflow-hidden rounded-xl border border-line-strong bg-surface", className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
    >
      {isNative ? (
        <div
          ref={track}
          /*
            `h-full` so a caller can hand this a height instead of an aspect.
            The slides size themselves from `aspect` by default, which is right
            almost everywhere — a fixed box means a slow image moves nothing. The
            hero is the exception: there the carousel has to match the height of
            the copy beside it, so it is given `lg:h-full` and the aspect is
            dropped at that breakpoint. Without this the track has no height to
            pass down and the slides collapse.
          */
          className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
              className={cn("relative w-full shrink-0 snap-start", aspect)}
            >
              <SlideMedia
                sizes={sizes}
                slide={slide}
                autoplay={autoplay}
                eager={distance(i) <= 1}
                priority={priority && i === 0}
                painted={Boolean(painted[i])}
                onPaint={() => markPainted(i)}
              />
              {/*
                Re-keyed on becoming current, so the entrance replays each
                time this slide scrolls into view — every slide in the native
                track is mounted from the start, and a CSS animation runs
                once, when its element is created.
              */}
              <SlideCaption
                key={i === index ? `on-${i}` : `off-${i}`}
                slide={slide}
                animation={i === index ? captionAnimation : "none"}
              />
            </div>
          ))}
        </div>
      ) : (
        /*
          `bg-dark`, not the section's own `bg-surface`. `gallery-fade` and
          `gallery-zoom` animate through `opacity: 0`, and Gallery's lightbox
          gets away with that because its dialog sits on a near-black
          backdrop — here there was nothing behind the fading image but the
          light-in-light-mode `bg-surface` on the section, so every fade
          opened with a flash of the page's own colour before the photo took
          over. A photograph fading in over dark reads as a fade; the same
          fade over white reads as a flash.
        */
        <div
          className={cn("relative w-full bg-dark", aspect)}
          style={{ "--slider-transition-ms": `${TRANSITION_MS}ms` } as CSSProperties}
        >
          {stacked.map(([i, role]) => (
            <div
              key={`s-${i}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
              aria-hidden={role !== "current" || undefined}
              className={cn(
                "absolute inset-0",
                role === "neighbour" && "invisible",
                role === "outgoing" && "pointer-events-none",
                role === "current" && enterClass,
              )}
            >
              <SlideMedia
                sizes={sizes}
                slide={slides[i]}
                autoplay={role === "current" && autoplay}
                eager
                priority={priority && i === 0 && role === "current"}
                // No placeholder while something is on screen to be covered —
                // the outgoing slide is opaque, and a skeleton drawn above it
                // is the flash this stack exists to remove.
                placeholder={role === "current" && outgoing === null}
                painted={Boolean(painted[i])}
                onPaint={() => markPainted(i)}
              />
              {/*
                The words animate only while the slide is current; a class
                added when it becomes current is what starts them, and a
                slide that comes round again gets the class again.
              */}
              <SlideCaption slide={slides[i]} animation={role === "current" ? captionAnimation : "none"} />
            </div>
          ))}
        </div>
      )}

      {slides.length > 1 && (
        <>
          <button type="button" onClick={() => goTo(index - 1)} aria-label="Previous slide" className={arrow("left-2")}>
            <Chevron className="rotate-180" />
          </button>
          <button type="button" onClick={() => goTo(index + 1)} aria-label="Next slide" className={arrow("right-2")}>
            <Chevron />
          </button>

          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                // 24px of hit area around a 7px dot: the dot is the affordance,
                // the padding is the target.
                className="grid size-6 place-items-center"
              >
                <span
                  className={cn(
                    "block size-[7px] rounded-full transition-colors",
                    i === index ? "bg-card" : "bg-card/45",
                  )}
                />
              </button>
            ))}
          </div>

          {slider.autoplay && (
            <PlayPause playing={wantsPlay} onToggle={() => setOverride(!wantsPlay)} />
          )}

          {/* Announced to a screen reader as the slide changes, which the
              scroll position alone would not do. */}
          <p className="sr-only" aria-live="polite">
            Slide {index + 1} of {slides.length}
          </p>
        </>
      )}
    </section>
  );
}
