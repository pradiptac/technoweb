"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductVideo } from "@/types/store-merch";

/**
 * A store product's video in the gallery's well (2026-09-26).
 *
 * **A YouTube video is a facade until it is pressed**, the pattern
 * `youtube-embed.tsx` and `slide-media.tsx` already follow: an iframe loads
 * about a megabyte of third-party script and sets cookies on page load, which
 * would make the consent banner's claim false on every product page. So the
 * resting state is the uploaded poster — or, without one, a panel this site
 * draws — and a play button; `youtube-nocookie.com` is mounted on the press,
 * with `autoplay` because the press *was* the request to play. **Never
 * `i.ytimg.com`**: YouTube's own thumbnail would be the request this avoids,
 * and it is not in `img-src`.
 *
 * **A file is a plain `<video>`** with the browser's controls,
 * `preload="none"` so nothing is fetched until play, and `playsInline` so a
 * phone does not throw it full-screen. Its source is the API's storage, which
 * `media-src` names for that reason.
 */
export function ProductVideoPlayer({ video, name }: { video: ProductVideo; name: string }) {
  const [playing, setPlaying] = useState(false);
  const label = video.title || `${name} — video`;

  if (video.kind === "file" && video.url) {
    return (
      <video
        src={video.url}
        poster={video.poster_url}
        controls
        preload="none"
        playsInline
        aria-label={label}
        className="absolute inset-0 size-full bg-dark object-contain"
      />
    );
  }

  if (video.kind !== "youtube" || !video.youtube_id || !YOUTUBE_ID.test(video.youtube_id)) return null;

  if (playing) {
    return <YouTubeFrame id={video.youtube_id} title={label} />;
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group absolute inset-0 grid size-full place-items-center bg-linear-135 from-dark to-brand-900 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
    >
      {video.poster_url && (
        <Image src={video.poster_url} alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      )}
      <PlayDisc className="relative size-16" />
      {video.title && (
        /*
          On an opaque strip of its own rather than straight over the poster:
          a caption over a photograph cannot be made safe, and the audit
          grades what it can see.
        */
        <span className="absolute inset-x-0 bottom-0 bg-dark px-4 py-2.5 text-left text-13 font-semibold text-white">
          {video.title}
        </span>
      )}
      <span className="sr-only">
        Play the video{video.title ? `: ${video.title}` : ""}. It loads from YouTube, which sets its own cookies.
      </span>
    </button>
  );
}

/** A YouTube video id: eleven characters of the URL-safe alphabet. The API validates it; every embed here re-checks. */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The privacy-enhanced embed, mounted only after a press (or, on the "shop
 * the videos" shelf with autoplay on, after the visitor's consent and with
 * the video on screen). `youtube-nocookie.com` and no script API — an
 * iframe and nothing else, so the CSP's `frame-src` is the whole of the
 * allowance.
 *
 * `quiet` is the shelf's silent loop: muted, looping (YouTube loops only a
 * playlist, so the id is its own), no controls, inline on a phone. The
 * default is what a press asks for: sound, controls, play now. The `src` is
 * built from an id this line re-checks — nothing an editor typed reaches it.
 */
export function YouTubeFrame({ id, title, quiet = false }: { id: string; title: string; quiet?: boolean }) {
  if (!YOUTUBE_ID.test(id)) return null;

  const query = quiet
    ? `autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0`
    : "autoplay=1&rel=0";

  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${id}?${query}`}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen={!quiet}
      tabIndex={quiet ? -1 : undefined}
      className={`absolute inset-0 size-full border-0 bg-dark ${quiet ? "pointer-events-none" : ""}`}
    />
  );
}

/** The play mark, drawn rather than fetched; `scale` on hover, never `transform`. */
export function PlayDisc({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid place-items-center rounded-full bg-card/95 text-ink shadow-3 transition-[scale] duration-(--duration-base) ease-brand motion-safe:group-hover:scale-105 ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" className="ml-[8%] size-[45%]" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}
