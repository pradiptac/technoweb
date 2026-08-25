"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconArrowRight } from "@/components/icons";
import type { Slider as SliderData } from "@/types/api";

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
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [motionOk, setMotionOk] = useState(false);

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
    const el = track.current;
    if (!el) return;
    const count = slides.length;
    const target = ((next % count) + count) % count; // wrap both directions
    el.scrollTo({ left: target * el.clientWidth, behavior: smooth && motionOk ? "smooth" : "auto" });
  }, [slides.length, motionOk]);

  // The scroll position is the source of truth for which slide is showing —
  // a swipe changes it without going through goTo, and an index kept
  // separately would disagree with what is on screen.
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
  }, []);

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
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
            className={cn("relative w-full shrink-0 snap-start", aspect)}
          >
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
                preload={priority && i === 0 ? "auto" : "metadata"}
                aria-label={slide.alt ?? undefined}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : slide.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.url}
                alt={slide.alt ?? ""}
                loading={priority && i === 0 ? "eager" : "lazy"}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}

            {(slide.heading || slide.caption || slide.link_url) && (
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[rgba(18,20,13,.85)] to-transparent p-5 pt-12">
                {slide.heading && (
                  <p className="font-display text-[18px] font-semibold tracking-[-.02em] text-white">{slide.heading}</p>
                )}
                {slide.caption && <p className="mt-1 text-[13.5px] leading-[1.5] text-white/85">{slide.caption}</p>}
                {slide.link_url && (
                  <Link
                    href={slide.link_url}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded bg-card px-3 py-2 text-[13px] font-semibold text-ink hover:bg-brand-50"
                  >
                    {slide.link_label || "Read more"} <IconArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

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
