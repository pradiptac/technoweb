"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Gallery as GalleryData, GalleryItem } from "@/types/api";

/**
 * A tabbed picture grid whose thumbnails open a lightbox.
 *
 * **The gallery renders no heading of its own, deliberately.** It is embedded
 * by shortcode at an arbitrary depth in somebody else's body, so a component
 * that injects an `<h2>` produces a heading-level jump on every page that
 * embeds it — which `npm run audit` fails, and rightly: the body's own heading
 * already says what the section is. The gallery's `subtitle` therefore renders
 * as a paragraph, and its `name` is a console-side label that never reaches the
 * page.
 *
 * **Tabs are only drawn when there is more than one group.** A single tab is a
 * control with one option, which reads as a filter that is broken rather than
 * as a filter that is unnecessary. "All" is prepended for the same reason it
 * exists in the media library — a picture may be ungrouped, and without All
 * there would be no tab that shows it.
 */
export function Gallery({
  gallery, className,
}: {
  gallery: GalleryData;
  className?: string;
}) {
  const items = useMemo(() => gallery.items ?? [], [gallery.items]);
  const groups = gallery.groups ?? [];

  const [tab, setTab] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  /*
    The pictures the active tab shows.

    The lightbox is indexed into *this* list rather than into every item, so
    Next and Previous walk the tab somebody is looking at. Paging out of a
    filter into pictures that are not on screen is the behaviour people read as
    the filter having been ignored.
  */
  const shown = useMemo(
    () => (tab === null ? items : items.filter((i) => i.group === tab)),
    [items, tab],
  );

  // A tab with nothing in it is a real state — somebody made it and has not
  // filled it yet — so it is rendered and says so rather than being hidden.
  if (items.length === 0) return null;

  return (
    <section className={cn("not-prose", className)}>
      {gallery.subtitle && (
        <p className="measure mb-5 text-[14.5px] leading-[1.6] text-muted">{gallery.subtitle}</p>
      )}

      {groups.length > 1 && (
        <div
          role="tablist"
          aria-label="Filter these pictures"
          className="mb-5 flex flex-wrap gap-2"
        >
          <Tab active={tab === null} onSelect={() => setTab(null)}>All</Tab>
          {groups.map((g) => (
            <Tab key={g.slug} active={tab === g.slug} onSelect={() => setTab(g.slug)}>
              {g.name}
            </Tab>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-[13.5px] text-muted">
          Nothing filed under this heading yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpen(i)}
                className={cn(
                  "group block w-full cursor-pointer overflow-hidden rounded-lg text-left",
                  "border border-line-strong bg-card",
                  "transition-all duration-200 ease-brand hover:border-brand-300 hover:shadow-2",
                )}
              >
                {/*
                  A fixed 4:3 well, so a slow image cannot move the grid — the
                  rule every other cover on this site follows. `overflow-hidden`
                  contains the hover zoom, which would otherwise widen the
                  document and trip the zero-tolerance overflow check.
                */}
                <span className="relative block aspect-[4/3] w-full overflow-hidden bg-surface-2">
                  {/*
                    A plain <img>, not next/image, for the reason the slider and
                    the media browser both give: the source is a runtime URL on
                    the API's own origin, and `images.remotePatterns` currently
                    names only the development host — the production one is an
                    outstanding deploy task. next/image would therefore work here
                    and 400 in production, while an <img> works in both. There is
                    also no layout to reserve: this well is a fixed 4:3 box.
                  */}
                  {item.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.alt ?? ""}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-brand motion-safe:group-hover:scale-[1.04]"
                    />
                  )}
                </span>

                {/*
                  The caption sits **under** the picture, not over it.

                  Over it, it cannot be made safe: the background is a
                  photograph nobody has seen yet, so white text on a gradient is
                  legible over a dark image and invisible over a pale one — and
                  `npm run audit` said so, measuring the worst of these at
                  **1.13:1**. A flat wash dark enough to guarantee 4.5:1 over a
                  white photograph greys the bottom third of every picture in
                  the grid, which is a worse trade than a line of text below it.

                  Below, it is ink on card: the same pairing every other card on
                  this site uses, checked in both schemes, and the picture is not
                  obscured at all.
                */}
                {(item.title || item.subtitle) && (
                  <span className="block px-3 py-2.5">
                    {item.title && (
                      <span className="block truncate text-[13px] font-semibold text-ink">{item.title}</span>
                    )}
                    {item.subtitle && (
                      <span className="block truncate text-[12px] text-muted">{item.subtitle}</span>
                    )}
                  </span>
                )}

                <span className="sr-only">
                  Open {item.title ?? item.alt ?? `picture ${i + 1}`} at full size
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open !== null && (
        <Lightbox
          items={shown}
          start={open}
          autoplay={gallery.autoplay}
          intervalMs={gallery.interval_ms}
          transition={gallery.transition}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function Tab({
  active, onSelect, children,
}: { active: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200",
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-line-strong bg-card text-ink-2 hover:border-brand-300 hover:text-brand-ink",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The lightbox: a real `<dialog>`, opened imperatively.
 *
 * It does **not** go through `components/ui/modal.tsx`, and that is a decision
 * rather than an oversight. `Modal` is a 34rem card with a title bar, a padded
 * body and a footer — override its width, its background, its padding and hide
 * its header and nothing of it is left but the three lines of `<dialog>`
 * mechanics. So those three are reproduced here, for the reasons that file
 * documents at length: `showModal()` is the only way to get a *modal* dialog
 * and has to be called imperatively; the `close` event must be listened for or
 * Escape closes the element while React still believes it is open, and it can
 * then never be reopened; and a backdrop click is told from a panel click by
 * comparing the event target against `currentTarget`.
 *
 * What the element buys, beyond not writing a focus trap: focus is trapped,
 * the rest of the page goes inert to a screen reader, it paints in the top
 * layer so nothing can clip it, and the browser puts focus back on the
 * thumbnail that opened it. A closed `<dialog>` also computes to
 * `display: none`, so it contributes nothing to `documentElement.scrollWidth`
 * and cannot trip the overflow check.
 */
function Lightbox({
  items, start, autoplay, intervalMs, transition, onClose,
}: {
  items: GalleryItem[];
  start: number;
  autoplay: boolean;
  intervalMs: number;
  /**
   * One of the values `App\Enums\GalleryTransition` owns. Not a union type
   * here on purpose: the list is the API's, and a copy of it in TypeScript is
   * the drift nothing type-checks across the wire. An unknown value falls
   * through to a fade below rather than throwing — a stored value outlives the
   * rule that accepted it, and the lightbox is the wrong place to discover
   * that.
   */
  transition: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(start);
  /*
    Which way the last move went, for the slide transition alone.

    A slide has to know where the picture is coming *from*, and that is not a
    property of the picture — it is a property of the press. Held beside the
    index rather than derived from it, because "3 after 2" and "3 after 4" are
    the same index and opposite directions, and wrapping from the last picture
    to the first is forward while the numbers go backwards.
  */
  const [forward, setForward] = useState(true);
  const [motionOk, setMotionOk] = useState(false);
  /*
    Whether the slideshow is running.

    Held as an **override** over the gallery's own setting rather than as a
    copy of it, so the answer is derived and there is no effect writing state
    on mount — `useState(false)` plus an effect that seeds it is a cascading
    render, and it also paints one frame of "paused" before the real answer
    lands.

    Null means nobody has decided yet, so the gallery's setting stands. Once
    somebody presses Next they are driving, and an automatic advance a second
    later would take the picture away from them — so the manual controls set
    the override to false, which is what every video player has trained people
    to expect.
  */
  const [override, setOverride] = useState<boolean | null>(null);

  // Read on mount rather than at render: there is no matchMedia on the server,
  // and assuming motion is fine until proven otherwise autoplays one frame
  // before the check lands.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setMotionOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /*
    Autoplay never *starts* under reduced motion. Content that moves on its own
    is the thing that setting most obviously means, and a slideshow that
    ignores it is the clearest possible failure of it. The control is still
    offered, so somebody who wants it can press play — which is what the
    override is for.
  */
  const playing = override ?? (motionOk && autoplay);

  const count = items.length;
  const go = useCallback(
    (next: number, goingForward = true) => {
      setForward(goingForward);
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  // Escape is the dialog's own; the arrows are ours. Bound to the element
  // rather than to the document, so they cannot fire for a page behind a
  // lightbox that is closing.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      setOverride(false);
      const next = e.key === "ArrowRight";
      go(index + (next ? 1 : -1), next);
    };

    dialog.addEventListener("keydown", onKey);
    return () => dialog.removeEventListener("keydown", onKey);
  }, [go, index]);

  useEffect(() => {
    if (!playing || count < 2) return;
    const id = setInterval(() => go(index + 1, true), Math.max(2000, intervalMs));
    return () => clearInterval(id);
  }, [playing, index, intervalMs, count, go]);

  // A hidden tab is not somebody watching a slideshow.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setOverride(false); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const item = items[index];
  const close = () => ref.current?.close();

  /*
    The class that animates the picture in.

    `none` and anything unrecognised produce no class at all, which is the
    correct behaviour for both: a stored value can outlive the rule that
    accepted it, and a lightbox that threw over one would be a page that fails
    rather than a transition that does not run.

    Every rule sits inside `prefers-reduced-motion: no-preference` in
    `globals.css`, so under `reduce` the class is present and inert — the
    picture is simply replaced, which is what that setting asks for.
  */
  const animation =
    transition === "slide" ? (forward ? "gallery-slide-forward" : "gallery-slide-back")
    : transition === "zoom" ? "gallery-zoom"
    : transition === "fade" ? "gallery-fade"
    : "";

  return (
    <dialog
      ref={ref}
      aria-label="Picture viewer"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      className={cn(
        "m-auto h-[100dvh] max-h-none w-screen max-w-none bg-transparent p-0 text-white",
        /*
          Nearly opaque, not merely dark. At 85% the site header and the grid
          behind it were still legible through the backdrop, which makes this
          read as a panel over a page rather than as a picture on its own —
          measured in a screenshot, not judged from the number.
        */
        "backdrop:bg-black/95 backdrop:backdrop-blur-[3px]",
      )}
    >
      <div className="grid h-full grid-rows-[auto_1fr_auto] gap-2 p-3 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-white/70 tabular-nums">
            {index + 1} / {count}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            {count > 1 && (
              <Control
                onClick={() => setOverride(!playing)}
                label={playing ? "Pause the slideshow" : "Play the slideshow"}
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
              </Control>
            )}
            <Control onClick={close} label="Close">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Control>
          </div>
        </div>

        {/* `min-h-0` is what lets this row actually shrink: a grid child's
            automatic minimum is its content, so without it a tall photograph
            pushes the caption and the controls off the bottom of the screen. */}
        <div className="relative min-h-0">
          {item?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              /*
                Keyed on the index, not the id.

                A CSS animation runs when the element is created; re-pointing an
                existing <img> at a new `src` is not a new element, so the
                animation would play once on open and never again. The index is
                what changes on every move — and a gallery may legitimately hold
                the same picture twice, where the id would not change at all.
              */
              key={index}
              src={item.url}
              alt={item.alt ?? ""}
              /*
                `contain`, never `cover`. This is the view somebody opened in
                order to see the whole picture, and it is the one place where
                cropping is definitely wrong.
              */
              className={cn("absolute inset-0 h-full w-full object-contain", animation)}
            />
          )}

          {count > 1 && (
            <>
              <Arrow side="left" onClick={() => { setOverride(false); go(index - 1, false); }} />
              <Arrow side="right" onClick={() => { setOverride(false); go(index + 1, true); }} />
            </>
          )}
        </div>

        {/*
          The caption row is always rendered, even when the picture has neither
          a title nor a subtitle. Otherwise the image area changes height as the
          slideshow moves between a captioned picture and an uncaptioned one,
          and the whole thing jumps on its own every few seconds.
        */}
        <div className="min-h-[2.5rem] text-center">
          {item?.title && <p className="text-[15px] font-semibold">{item.title}</p>}
          {item?.subtitle && <p className="mt-0.5 text-[13px] text-white/75">{item.subtitle}</p>}
        </div>
      </div>
    </dialog>
  );
}

function Control({
  onClick, label, children,
}: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-9 cursor-pointer place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
    >
      {children}
    </button>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous picture" : "Next picture"}
      className={cn(
        "absolute top-1/2 z-10 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full",
        "bg-white/10 text-white transition-colors hover:bg-white/20",
        side === "left" ? "left-1 sm:left-2" : "right-1 sm:right-2",
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={side === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}
