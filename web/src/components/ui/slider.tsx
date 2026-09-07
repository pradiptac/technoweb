"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
 * render the *outgoing* slide alongside the incoming one for the length of
 * one transition, each keyed on its own index so both animate independently
 * — the outgoing one fading out while the incoming one fades in, rather than
 * the outgoing one simply vanishing and the incoming one fading in over
 * nothing. `goTo` chooses the mechanism itself, from whether the native
 * track is mounted: with no scrollable element to scroll, it falls through
 * to setting the index directly.
 *
 * This is deliberately its own pair of keyframes (`slide-fade-*`,
 * `slide-zoom-*` in `globals.css`) rather than `Gallery`'s `gallery-fade`/
 * `gallery-zoom` — those animate a single element *in* only, at 320ms, which
 * suits a lightbox someone is clicking through; a crossfade needs a second,
 * *out*-going animation and reads better slower, so it runs on its own
 * duration (`TRANSITION_MS`) rather than borrowing one tuned for something
 * else.
 */
const TRANSITION_MS = 700;
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
    The slide being crossfaded away from, for `fade`/`zoom` only — `null`
    once the transition has finished and only the current slide need render.

    `prevIndex` is a ref, not state: it has to hold the *previous* value at
    the moment `index` changes, and reading state inside the same effect that
    reacts to that state's own change would already see the new value. The
    effect sets `outgoing` from the ref before advancing it, which is what
    lets rapid clicks always crossfade from whatever is on screen rather than
    queuing every intermediate slide.
  */
  const prevIndex = useRef(0);
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

  // Arms the crossfade: whatever was showing keeps rendering, fading out,
  // for one transition's length after the index that replaces it commits.
  // No-op for the native track and for "none", neither of which has an
  // outgoing element to keep around.
  useEffect(() => {
    if (isNative || transition === "none") { prevIndex.current = index; return; }
    if (prevIndex.current === index) return;
    setOutgoing(prevIndex.current);
    prevIndex.current = index;
    const timer = setTimeout(() => setOutgoing(null), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [index, isNative, transition]);

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
    transition === "zoom" ? "slide-zoom-in"
    : transition === "fade" ? "slide-fade-in"
    : ""; // "none", or a stored value the enum no longer knows — swap with no animation rather than throw.
  const exitClass =
    transition === "zoom" ? "slide-zoom-out"
    : transition === "fade" ? "slide-fade-out"
    : "";

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
        <div
          className={cn("relative w-full bg-dark", aspect)}
          style={{ "--slider-transition-ms": `${TRANSITION_MS}ms` } as CSSProperties}
        >
          {/*
            The outgoing slide stays mounted and fading out for exactly as
            long as the incoming one takes to fade in, so the two overlap
            instead of the old one vanishing before the new one has anything
            to cover it. `pointer-events-none` — it is on its way out, and a
            caption link on a slide nobody can see any more must not still
            be clickable through the one now on top of it.
          */}
          {outgoing !== null && (
            <SlideMedia
              key={`out-${outgoing}`}
              slide={slides[outgoing]}
              autoplay={false}
              eager
              priority={false}
              painted
              onPaint={() => {}}
              className={cn("pointer-events-none", exitClass)}
            />
          )}
          <SlideMedia
            key={`in-${index}`}
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

/**
 * Where the caption sits, and what goes behind it so the words stay readable.
 *
 * Nine anchors, keyed on the slide's own `caption_position`. The alignment is
 * the easy half — a full-slide flex container and two axes. The scrim is the
 * half that has to be got right, and the rule is the one `blog-hero.tsx` and
 * this component's own bottom band already follow: **an opaque colour stop, or
 * the audit cannot see it.** A translucent wash reads as correctly dark in a
 * screenshot and is discarded by `gradientStops()`'s opacity check, so the
 * text is graded against whatever opaque colour is further up the tree — the
 * section's near-white `bg-surface` in light mode, which is what reported
 * 1.04:1 the first time a slide carried a heading.
 *
 * So each anchor fades from a fully opaque `--color-dark` at its own edge or
 * corner. The **middle row is the exception and gets a panel instead**: an
 * anchor in the centre of the picture has no edge to fade from, and a
 * gradient dark enough to carry text there would be dark enough to bury the
 * photograph everywhere else. A contained opaque panel is both honest about
 * its contrast and the treatment a centred hero caption usually wants.
 */
const ANCHOR: Record<string, string> = {
  "top-left": "items-start justify-start text-left",
  "top-centre": "items-start justify-center text-center",
  "top-right": "items-start justify-end text-right",
  "middle-left": "items-center justify-start text-left",
  "middle-centre": "items-center justify-center text-center",
  "middle-right": "items-center justify-end text-right",
  "bottom-left": "items-end justify-start text-left",
  "bottom-centre": "items-end justify-center text-center",
  "bottom-right": "items-end justify-end text-right",
};

const SCRIM: Record<string, string> = {
  "top-left": "bg-linear-to-br from-dark to-transparent",
  "top-centre": "bg-linear-to-b from-dark to-transparent",
  "top-right": "bg-linear-to-bl from-dark to-transparent",
  "middle-left": "",
  "middle-centre": "",
  "middle-right": "",
  "bottom-left": "bg-linear-to-tr from-dark to-transparent",
  "bottom-centre": "bg-linear-to-t from-dark to-transparent",
  "bottom-right": "bg-linear-to-tl from-dark to-transparent",
};

function SlideCaption({ slide }: { slide: Slide }) {
  if (!slide.heading && !slide.caption && !slide.link_url) return null;

  // An unknown value falls back rather than rendering an unpositioned block —
  // a stored value outlives the rule that accepted it, the reason
  // `SchemaTypes::resolve()` narrows on the way out as well as validating on
  // the way in.
  const position = slide.caption_position && ANCHOR[slide.caption_position]
    ? slide.caption_position
    : "bottom-left";
  const middle = position.startsWith("middle-");

  return (
    /*
      `px-14` on a phone, not `p-5`: the previous/next buttons are 44px inset
      8px from each edge, so a caption padded to 20px ran underneath them — the
      arrow sat on top of the words and clipped the line behind it. Above `sm`
      there is room for both and the padding goes back to being about the
      picture's own margins.
    */
    <div className={cn("absolute inset-0 flex px-14 py-5 sm:p-8", ANCHOR[position], SCRIM[position])}>
      <div
        className={cn(
          "max-w-[46ch]",
          // The panel the middle row needs, and nothing at all for the rows
          // that fade from an edge — a panel there would sit inside its own
          // gradient and read as a box drawn on the picture for no reason.
          middle && "rounded-lg bg-dark p-5 sm:p-6",
        )}
      >
        {slide.heading && (
          <p className="font-display text-[18px] font-semibold tracking-[-.02em] text-white sm:text-[24px]">
            {slide.heading}
          </p>
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
        {slide.caption && (
          <p className="mt-1.5 line-clamp-4 text-[13.5px] leading-[1.5] text-[rgba(255,255,255,.85)] sm:line-clamp-none sm:text-[15px]">
            {slide.caption}
          </p>
        )}
        {slide.link_url && (
          <Link
            href={slide.link_url}
            className="mt-3 inline-flex items-center gap-1.5 rounded bg-card px-3 py-2 text-[13px] font-semibold text-ink hover:bg-brand-50"
          >
            {slide.link_label || "Read more"} <IconArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
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
