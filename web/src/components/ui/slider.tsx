"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconArrowRight } from "@/components/icons";
import type { Slider as SliderData, Slide } from "@/types/api";

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
 * render only the *current* slide, keyed on its index so the element remounts
 * and the entrance animation restarts on every move — the same mechanism
 * `Gallery`'s lightbox uses for the same three names, and the
 * `gallery-fade`/`gallery-zoom` keyframes in `globals.css` are reused rather
 * than duplicated. `goTo` chooses the mechanism itself, from whether the
 * native track is mounted: with no scrollable element to scroll, it falls
 * through to setting the index directly.
 */
export function Slider({
  slider, className, aspect = "aspect-[4/3]", priority = false,
}: {
  slider: SliderData;
  className?: string;
  /** The box every slide fills. Fixed, so nothing shifts as media loads. */
  aspect?: string;
  /** Eager-load the first slide — set this only for the one above the fold. */
  priority?: boolean;
}) {
  const slides = slider.slides ?? [];
  const transition = slider.transition || "slide";
  const isNative = transition === "slide";
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [motionOk, setMotionOk] = useState(false);
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

  // Read once on mount rather than at render: the server has no matchMedia,
  // and assuming "motion is fine" until proven otherwise would autoplay one
  // frame before the check lands.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setMotionOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const goTo = useCallback((next: number, smooth = true) => {
    const count = slides.length;
    const target = ((next % count) + count) % count; // wrap both directions
    const el = track.current;
    if (el) {
      el.scrollTo({ left: target * el.clientWidth, behavior: smooth && motionOk ? "smooth" : "auto" });
    } else {
      // No native track mounted — a `fade`/`zoom`/`none` slider has nothing
      // to scroll, so the index is the only thing that moves.
      setIndex(target);
    }
  }, [slides.length, motionOk]);

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

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const autoplay = slider.autoplay && motionOk && !paused && slides.length > 1;

  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => goTo(index + 1), Math.max(2000, slider.interval_ms));
    return () => clearInterval(id);
  }, [autoplay, index, slider.interval_ms, goTo]);

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
    transition === "zoom" ? "gallery-zoom"
    : transition === "fade" ? "gallery-fade"
    : ""; // "none", or a stored value the enum no longer knows — swap with no animation rather than throw.

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
                slide={slide}
                autoplay={autoplay}
                eager={distance(i) <= 1}
                priority={priority && i === 0}
                painted={Boolean(painted[i])}
                onPaint={() => markPainted(i)}
              />
              <SlideCaption slide={slide} />
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
        <div className={cn("relative w-full bg-dark", aspect)}>
          <SlideMedia
            key={index}
            slide={slides[index]}
            autoplay={autoplay}
            eager
            priority={priority && index === 0}
            painted={Boolean(painted[index])}
            onPaint={() => markPainted(index)}
            className={enterClass}
          />
          <SlideCaption slide={slides[index]} />
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

/**
 * One slide's media — image, video, or a click-to-play YouTube embed.
 *
 * Shared between the native scroll-snap track and the single-slide swap the
 * `fade`/`zoom`/`none` transitions use, so the per-`kind` branches — and the
 * placeholder that sits under them — exist in exactly one place rather than
 * two copies free to drift apart.
 */
function SlideMedia({
  slide, autoplay, eager, priority, painted, onPaint, className,
}: {
  slide: Slide;
  /** The slider's own autoplay, reused as a video's `autoplay` attribute. */
  autoplay: boolean;
  eager: boolean;
  priority: boolean;
  painted: boolean;
  onPaint: () => void;
  /** The entrance-animation class, for the single-slide swap only. */
  className?: string;
}) {
  return (
    <>
      {/*
        The placeholder, and it sits **under** the media rather than over it.

        Over the top it would need removing at exactly the right moment, and
        it would cover a video's own poster — which paints immediately and is
        a better placeholder than any skeleton. Under it, the media simply
        covers it as it paints, so the worst case is a frame too many rather
        than a panel hiding real content.

        A YouTube slide renders its own opaque panel, so it needs none.
      */}
      {slide.kind !== "youtube" && slide.url && !painted && (
        <span aria-hidden className="absolute inset-0 bg-surface-2 motion-safe:animate-pulse" />
      )}

      {slide.kind === "youtube" && slide.youtube_id ? (
        <YouTubeSlide id={slide.youtube_id} poster={slide.poster_url} label={slide.alt ?? slide.heading} />
      ) : slide.kind === "video" && slide.url ? (
        <video
          src={slide.url}
          poster={slide.poster_url ?? undefined}
          // Muted and inline or a browser will refuse to autoplay it;
          // controls whenever it is not driving itself, so the video is
          // never a thing the reader cannot start.
          muted
          loop
          playsInline
          autoPlay={autoplay}
          controls={!autoplay}
          preload={priority ? "auto" : "metadata"}
          onLoadedData={onPaint}
          onError={onPaint}
          aria-label={slide.alt ?? undefined}
          className={cn("absolute inset-0 h-full w-full object-cover", className)}
        />
      ) : slide.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slide.url}
          alt={slide.alt ?? ""}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          /*
            `complete` covers the image that was already in cache.

            A cached file can finish before React attaches `onLoad`, so a
            placeholder cleared only by that event would sit over a picture
            that is fully there — on a second visit, which is every visit
            after the first.
          */
          ref={(el) => { if (el?.complete) onPaint(); }}
          onLoad={onPaint}
          // A broken image must not pulse forever. It leaves the alt text
          // and the empty box, which is what a broken image is.
          onError={onPaint}
          className={cn("absolute inset-0 h-full w-full object-cover", className)}
        />
      ) : null}
    </>
  );
}

function SlideCaption({ slide }: { slide: Slide }) {
  if (!slide.heading && !slide.caption && !slide.link_url) return null;
  return (
    /*
      `from-dark`, not a semi-transparent literal. A 85%-alpha stop reads as
      correctly dark in a screenshot and is invisible to the audit: its only
      colour stop fails the opacity check `gradientStops()` uses to skip a
      translucent flat background, so the whole gradient is discarded and the
      text is graded against whatever opaque colour is further up the
      ancestor chain — here the section's own `bg-surface`, near-white in
      light mode, which is what reported 1.04:1 the moment a slide first
      carried a heading. `blog-hero.tsx`'s identical fade already uses the
      fully-opaque token for the same reason.
    */
    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-dark to-transparent p-5 pt-12">
      {slide.heading && (
        <p className="font-display text-[18px] font-semibold tracking-[-.02em] text-white">{slide.heading}</p>
      )}
      {/*
        `text-[rgba(255,255,255,.85)]`, not `text-white/85`. Tailwind v4
        resolves an opacity-modified colour through `color-mix(...in oklab)`,
        which `getComputedStyle` reports back as an `oklab(...)` string — and
        the audit's contrast check only knows how to read `rgb()`/`rgba()`.
        It still matches enough digits out of the oklab string to compute a
        number, so the failure is silent: `oklab(0.999994 0.0000455…)`'s
        lightness channel gets read as an RGB byte of "1", which is a report
        of near-black text on a photograph — a false 1.12:1. A literal
        arbitrary value bypasses Tailwind's colour-mix machinery entirely, so
        the computed value stays a plain `rgba()` the check can read, at the
        identical visual weight.
      */}
      {slide.caption && <p className="mt-1 text-[13.5px] leading-[1.5] text-[rgba(255,255,255,.85)]">{slide.caption}</p>}
      {slide.link_url && (
        <Link
          href={slide.link_url}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded bg-card px-3 py-2 text-[13px] font-semibold text-ink hover:bg-brand-50"
        >
          {slide.link_label || "Read more"} <IconArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

/**
 * A YouTube slide that loads nothing from YouTube until it is clicked.
 *
 * An embed iframe pulls roughly a megabyte of third-party JavaScript and makes
 * a request to Google before anyone has asked to watch anything. On a site
 * whose analytics are gated behind a consent banner, silently shipping that on
 * page load would make the banner a lie: the tracking happens either way, it
 * just happens through a video player instead of a tag.
 *
 * So the resting state is a poster and a play button, and the iframe is
 * mounted on the first click. `youtube-nocookie.com` is the host for the same
 * reason — it is the one that does not set the tracking cookie.
 *
 * The poster is an uploaded image, deliberately, rather than YouTube's own
 * thumbnail URL: fetching that would be the very third-party request this
 * avoids. With no poster the slide shows a brand panel, which is honest about
 * being a video rather than pretending to be a frame of one.
 */
function YouTubeSlide({ id, poster, label }: { id: string; poster: string | null; label: string | null }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        // Built here from an id the API validated — nothing an editor typed
        // reaches this attribute.
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
        title={label ?? "Video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="absolute inset-0 grid h-full w-full place-items-center bg-dark"
    >
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      )}
      <span className="relative grid size-14 place-items-center rounded-full bg-card/90 shadow-2 transition-transform hover:scale-105">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden className="ml-0.5 text-ink">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="sr-only">{label ? `Play video: ${label}` : "Play video"}</span>
    </button>
  );
}

const arrow = (side: string) =>
  cn(
    "absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full",
    "bg-card/85 text-ink shadow-2 backdrop-blur-sm transition-opacity",
    "hover:bg-card focus-visible:opacity-100",
    // Present for touch and keyboard always; fading in on hover for a mouse
    // keeps them off the picture until they are wanted.
    "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-[767px]:opacity-100",
    side,
  );

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
