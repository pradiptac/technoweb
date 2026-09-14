import { cn } from "@/lib/utils";

/**
 * The pause control an auto-advancing carousel has to offer. Always visible,
 * unlike the arrows, which fade in on hover: the arrows have the dots and a
 * swipe as other ways in, and this has none. Rendered only when the slider
 * is set to autoplay — a play button on a carousel that never moved by
 * itself is a promise about nothing. Shared with `CardsSlider`.
 */
export function PlayPause({ playing, onToggle, className = "bottom-2 right-2" }: { playing: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? "Pause the slideshow" : "Play the slideshow"}
      aria-pressed={!playing}
      className={cn("absolute z-10 grid size-8 place-items-center rounded-full bg-card/85 text-ink shadow-2 backdrop-blur-sm transition-colors duration-(--duration-fast) hover:bg-card", className)}
    >
      {playing ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      )}
    </button>
  );
}

export const arrow = (side: string) =>
  cn(
    "absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full",
    "bg-card/85 text-ink shadow-2 backdrop-blur-sm transition-opacity",
    "hover:bg-card focus-visible:opacity-100",
    // Present for touch and keyboard always; fading in on hover for a mouse
    // keeps them off the picture until they are wanted.
    "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-[767px]:opacity-100",
    side,
  );

export function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
