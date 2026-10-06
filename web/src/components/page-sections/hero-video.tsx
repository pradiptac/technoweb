"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { focalStyle } from "@/lib/focal";
import { useDocumentHidden, useMotionOk } from "@/lib/hooks/use-carousel";
import { cn } from "@/lib/utils";

/**
 * A cover hero's background video (0.115.0, `docs/page-builder.md`): the one
 * client island in the hero, drawn over the band's picture and under its
 * words.
 *
 * **The picture stays the first paint.** The video starts invisible, with
 * `preload="none"` and no poster — the `next/image` beneath it already *is*
 * the poster, optimised and sized for the screen, and a `poster` attribute
 * would be a second download of the same photograph outside its srcset. Not
 * one byte of the video is fetched until it is asked to play, and it fades
 * in only once it is actually playing, to the picture's own 35%, so the
 * words are still graded against the dark band (`hero-section.tsx`).
 *
 * It plays only when all of these hold, read after mount rather than at
 * render (the server has neither `matchMedia` nor `navigator`):
 *
 * - motion is welcome (`prefers-reduced-motion: no-preference`, tracked live);
 * - the visitor has not asked to save data (`navigator.connection.saveData`);
 * - the tab is visible;
 * - the visitor has not pressed Pause.
 *
 * Otherwise it is paused — or, for the first two, never started and never
 * shown, and the Pause button is not drawn at all: only the picture shows.
 * The button is WCAG 2.2.2's control for something moving for more than five
 * seconds, styled and placed as the carousels' `PlayPause` is; its name says
 * it is the background video, not a slideshow.
 *
 * The video is decorative — `aria-hidden`, muted, no controls, never in the
 * tab order — and absolutely placed in the hero's own clipping box, so it
 * cannot change the band's height or widen the page.
 */
export function HeroVideo({ src, focus }: { src: string; focus?: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const motionOk = useMotionOk();
  const hidden = useDocumentHidden();
  const saveData = useSyncExternalStore(subscribeSaveData, saveDataNow, saveDataOnServer);
  const [paused, setPaused] = useState(false);
  const [shown, setShown] = useState(false);

  const allowed = motionOk && !saveData;
  const run = allowed && !hidden && !paused;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (run) {
      // The property, not only the attribute: autoplay policies read it.
      video.muted = true;
      // A refusal (an autoplay policy, a codec) leaves the picture showing.
      video.play().catch(() => {});
    } else if (!video.paused) {
      video.pause();
    }
  }, [run]);

  return (
    <>
      <video
        ref={ref}
        aria-hidden="true"
        tabIndex={-1}
        muted
        loop
        playsInline
        preload="none"
        onPlaying={() => setShown(true)}
        data-hero-video=""
        data-shown={shown ? "" : undefined}
        className={cn(
          "pointer-events-none absolute inset-0 size-full object-cover opacity-0",
          "motion-safe:transition-opacity motion-safe:duration-(--duration-slow) motion-safe:ease-brand",
          "data-[shown]:opacity-35",
        )}
        style={focalStyle(focus)}
      >
        <source src={src} />
      </video>
      {allowed && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play the background video" : "Pause the background video"}
          aria-pressed={paused}
          className="absolute bottom-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-card/85 text-ink shadow-2 backdrop-blur-sm transition-colors duration-(--duration-fast) hover:bg-card"
        >
          {paused ? (
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          )}
        </button>
      )}
    </>
  );
}

/** The Network Information API, where the browser has it (Chromium does; Safari and Firefox do not). */
type Connection = {
  saveData?: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

const connection = (): Connection | undefined => (navigator as Navigator & { connection?: Connection }).connection;

function subscribeSaveData(onChange: () => void): () => void {
  const c = connection();
  c?.addEventListener?.("change", onChange);
  return () => c?.removeEventListener?.("change", onChange);
}

const saveDataNow = (): boolean => connection()?.saveData === true;

/** Assume the visitor is saving data until the browser says otherwise: the server renders no button. */
const saveDataOnServer = (): boolean => true;
