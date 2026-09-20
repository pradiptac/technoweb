"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Slide } from "@/types/api";

/**
 * One slide's media — image, video, or a click-to-play YouTube embed.
 *
 * Shared between the native scroll-snap track and the single-slide swap the
 * `fade`/`zoom`/`none` transitions use, so the per-`kind` branches — and the
 * placeholder that sits under them — exist in exactly one place rather than
 * two copies free to drift apart. Its own module, beside `slide-caption.tsx`
 * and `slider-controls.tsx`, because `Slider` and `CardsSlider` both build
 * on all three and `slider.tsx` had grown to six components in one file.
 */
export function SlideMedia({
  slide, autoplay, eager, priority, painted, onPaint, className, sizes, placeholder = true,
}: {
  slide: Slide;
  sizes: string;
  /** The slider's own autoplay, reused as a video's `autoplay` attribute. */
  autoplay: boolean;
  eager: boolean;
  priority: boolean;
  painted: boolean;
  onPaint: () => void;
  /** The entrance-animation class, for the single-slide swap only. */
  className?: string;
  /** Whether to draw the skeleton under an unpainted slide at all. */
  placeholder?: boolean;
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
      {placeholder && slide.kind !== "youtube" && slide.url && !painted && (
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
        <Image
          src={slide.url}
          alt={slide.alt ?? ""}
          fill
          sizes={sizes}
          // `priority` is eager and high-priority in one; a neighbour that is
          // merely eager keeps the browser's default priority.
          priority={priority}
          loading={eager && !priority ? "eager" : undefined}
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
          className={cn("object-cover", className)}
        />
      ) : null}
    </>
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
        <Image src={poster} alt="" fill sizes="100vw" className="object-cover" />
      )}
      {/* `transition-[scale]`: `hover:scale-105` sets the `scale` property, which `transition-transform` never animated. */}
      <span className="relative grid size-14 place-items-center rounded-full bg-card/90 shadow-2 transition-[scale] duration-(--duration-base) ease-brand hover:scale-105">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden className="ml-0.5 text-ink">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="sr-only">{label ? `Play video: ${label}` : "Play video"}</span>
    </button>
  );
}
