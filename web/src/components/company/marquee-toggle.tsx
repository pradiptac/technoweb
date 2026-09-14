"use client";

import { useState, type MouseEvent } from "react";

/**
 * The pause button for the brand marquee.
 *
 * A client island inside a server component, and a deliberately small one:
 * `LogoMarquee` stays on the server because everything else in it is markup,
 * and this is the one thing in the strip that needs state. It flips
 * `data-paused` on the nearest `[data-marquee]` host, which is the selector
 * `globals.css` pairs with the hover and focus-within rules — so pausing is
 * one CSS rule with three ways in, not a second mechanism beside the first.
 *
 * It exists because the strip's visual track is `aria-hidden` and nothing in
 * it takes focus: hover pauses it for a mouse and `focus-within` could never
 * fire, so a keyboard had no way to stop content that moves by itself. The
 * button sits *inside* the host, so its own focus pauses the strip through
 * `focus-within` as well — the toggle is for making the pause stick after
 * focus has moved on.
 */
export function MarqueeToggle() {
  const [paused, setPaused] = useState(false);

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const host = e.currentTarget.closest<HTMLElement>("[data-marquee]");
    const next = !paused;
    if (host) {
      if (next) host.dataset.paused = "true";
      else delete host.dataset.paused;
    }
    setPaused(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={paused}
      aria-label={paused ? "Resume the partner logos" : "Pause the partner logos"}
      className="absolute bottom-0 right-0 z-10 grid size-7 place-items-center rounded-full border border-line bg-card/90 text-muted transition-colors duration-(--duration-fast) hover:text-ink focus-visible:text-ink"
    >
      {paused ? (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      )}
    </button>
  );
}
