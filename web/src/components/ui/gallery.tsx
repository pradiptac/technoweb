"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconZoomIn } from "@/components/icons-ui";
import { cn } from "@/lib/utils";
import { useAutoplay, useMotionOk, wrapIndex } from "@/lib/hooks/use-carousel";
import type { Gallery as GalleryData, GalleryItem } from "@/types/api";
import Image from "next/image";
import { focalStyle } from "@/lib/focal";

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
        <p className="measure mb-5 text-14-5 leading-[1.6] text-muted">{gallery.subtitle}</p>
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
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-13-5 text-muted">
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
                  "transition-all duration-(--duration-base) ease-brand hover:border-brand-300 hover:shadow-2",
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
                    next/image, like every other API-served picture now.
                    `images.remotePatterns` is derived from the asset origins
                    in `next.config.ts`, so the optimiser serves a resized
                    AVIF/WebP for this 4:3 well rather than the original
                    upload. The well is a fixed box, so `fill` has a size.
                  */}
                  {item.url && (
                    <Image
                      src={item.url}
                      alt={item.alt ?? ""}
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                      // The first row is the largest paint under a theme whose hero
                      // is short (Summit's centred band): eager, never `priority`,
                      // the case-study grid's rule.
                      loading={i < 4 ? "eager" : undefined}
                      /*
                        `transition-[scale]`, because `scale-*` sets the CSS
                        `scale` property — the trap the nav underline and the
                        chat panel both record. 8% over half a second reads as
                        a lean-in; the 4% it was measured at 1.037 mid-flight
                        and was reported as no animation at all.
                      */
                      className="object-cover transition-[scale] duration-500 ease-brand motion-safe:group-hover:scale-[1.08] motion-safe:group-focus-visible:scale-[1.08]"
                      style={focalStyle(item.focus)}
                    />
                  )}

                  {/*
                    The "open" affordance, on hover and on keyboard focus: a
                    wash over the picture and a magnifier on a solid disc
                    rising into the middle. The disc is opaque `dark` under
                    white — 17.9:1 whatever the photograph — the same call the
                    popup's close button makes, and no *text* goes over the
                    picture, which the caption-below rule beneath still stands
                    for. `pointer-events-none`: the button is the target.
                  */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 grid place-items-center bg-dark/25 opacity-0 transition-opacity duration-(--duration-slow) ease-brand group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <span className="grid size-11 place-items-center rounded-full bg-dark text-white shadow-2 transition-[scale] duration-(--duration-slow) ease-brand scale-75 group-hover:scale-100 group-focus-visible:scale-100">
                      <IconZoomIn className="size-5" />
                    </span>
                  </span>
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
                      <span className="block truncate text-13 font-semibold text-ink">{item.title}</span>
                    )}
                    {item.subtitle && (
                      <span className="block truncate text-12 text-muted">{item.subtitle}</span>
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
        // `rounded-md`, not `rounded-full`: the corner brackets that draw
        // themselves on hover (`.bracket-hover`, globals.css) need corners.
        "bracket-hover cursor-pointer rounded-md border px-3.5 py-1.5 text-13 font-semibold transition-colors duration-(--duration-base)",
        active
          ? "border-brand-600 bg-brand-600 text-brand-on"
          : "border-line-strong bg-card text-ink-2 hover:text-brand-ink",
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
/** The longest the unmount waits on a close transition that never reports finishing. */
const DIALOG_EXIT_FALLBACK_MS = 600;

/**
 * Exported for `ProductGallery`, whose main picture opens it: a 300px well
 * is small for a rack switch's port layout, and a second lightbox for one
 * more caller is the drift this codebase keeps catching.
 */
export function Lightbox({
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
  const thumbs = useRef(new Map<number, HTMLButtonElement>());
  const [index, setIndex] = useState(start);
  const motionOk = useMotionOk();
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

  /*
    Autoplay never *starts* under reduced motion. Content that moves on its own
    is the thing that setting most obviously means, and a slideshow that
    ignores it is the clearest possible failure of it. The control is still
    offered, so somebody who wants it can press play — which is what the
    override is for.
  */
  const playing = override ?? (motionOk && autoplay);

  const count = items.length;
  /*
    Zoom (2026-09-26): 1x to 3x on the current picture, and where it has been
    dragged to. Held here rather than in the picture, so every way of moving
    to another one — the arrows, the keys, a thumbnail, the slideshow —
    passes through `go`, which puts both back: a new picture always arrives
    whole. See `zoomTo()` for the arithmetic.
  */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const picture = useRef<HTMLImageElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  // The latest zoom and pan for the listeners bound outside React (the
  // wheel, the keys), written after each render rather than during it.
  const view = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  useEffect(() => { view.current = { zoom, pan }; }, [zoom, pan]);
  const gesture = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    start: { x: number; y: number; pan: { x: number; y: number } } | null;
    pinch: { distance: number; zoom: number } | null;
    moved: boolean;
  }>({ pointers: new Map(), start: null, pinch: null, moved: false });

  // The direction is no longer state: the flow's placement is derived from
  // the offset alone, so "3 after 2" and "3 after 4" both put the picture in
  // the middle, and the neighbours say where it came from.
  const go = useCallback((next: number) => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIndex(wrapIndex(next, count));
  }, [count]);

  /*
    Zoom to `next`, keeping the point under `at` (a client coordinate) where
    it is — or the middle, from a button or a key.

    The picture is scaled about its own centre and then translated
    (`scale` and `translate`, the individual properties, which compose in
    that order), so a point `p` lands at `c + s(p - c) + t`. Holding the point
    under the pointer still across a change from `s` to `s'` gives
    `t' = (q - c) - (s'/s)(q - c - t)`; the centre `c` is the transformed box's
    centre less the current translation, since scaling about the centre does
    not move it. Then the translation is clamped so the picture cannot be
    dragged off its own edge: at most `(s - 1) x size / 2` either way.
  */
  const zoomTo = useCallback((next: number, at?: { x: number; y: number }) => {
    const img = picture.current;
    const { zoom: s, pan: t } = view.current;
    const target = Math.min(3, Math.max(1, next));
    if (!img || target === 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const box = img.getBoundingClientRect();
    const c = { x: box.left + box.width / 2 - t.x, y: box.top + box.height / 2 - t.y };
    const q = at ?? { x: c.x + t.x, y: c.y + t.y };
    const k = target / s;
    setZoom(target);
    setPan(clampPan({
      x: (q.x - c.x) - k * (q.x - c.x - t.x),
      y: (q.y - c.y) - k * (q.y - c.y - t.y),
    }, target, img));
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  /*
    The `close` event is the element's own — Escape, the backdrop, the button
    all end here — and the parent unmounts this component on it. Unmounting
    the moment it fires would remove the element before the exit transition
    `dialog-motion` gives it (globals.css) has a frame to run, so the unmount
    waits for the transitions the close started to finish.

    Waits for them, not for a timer of their nominal length. Measured: the
    transition's clock starts on the first frame *after* `close()`, and on a
    page that has just lost a full-screen, backdrop-blurred top-layer element
    that frame costs 60–130ms of re-raster — so a 140ms timer unmounted the
    element as its fade began. Under reduced motion there are no transitions
    and it unmounts at once; the fallback timer is for a browser that starts
    none and never says so, the rule that state must not depend on an
    animation-end event alone.
  */
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (fallback) clearTimeout(fallback);
      onClose();
    };
    const leave = () => {
      const running = dialog.getAnimations();
      if (running.length === 0) { finish(); return; }
      Promise.allSettled(running.map((a) => a.finished)).then(finish);
      fallback = setTimeout(finish, DIALOG_EXIT_FALLBACK_MS);
    };
    dialog.addEventListener("close", leave);
    return () => {
      dialog.removeEventListener("close", leave);
      if (fallback) clearTimeout(fallback);
      done = true;
    };
  }, [onClose]);

  // Escape is the dialog's own; the arrows are ours. Bound to the element
  // rather than to the document, so they cannot fire for a page behind a
  // lightbox that is closing.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const onKey = (e: KeyboardEvent) => {
      // `+`, `-` and `0` zoom the current picture — the keys every image
      // viewer uses. `=` too, since `+` is a shifted `=` on most keyboards.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && ["+", "=", "-", "0"].includes(e.key)) {
        e.preventDefault();
        const { zoom: z } = view.current;
        zoomTo(e.key === "0" ? 1 : e.key === "-" ? z - 0.5 : z + 0.5);
        return;
      }
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      setOverride(false);
      const next = e.key === "ArrowRight";
      go(index + (next ? 1 : -1));
    };

    dialog.addEventListener("keydown", onKey);
    return () => dialog.removeEventListener("keydown", onKey);
  }, [go, index, zoomTo]);

  /*
    Ctrl + wheel zooms — which is also what a trackpad's pinch sends. Bound
    here rather than through React's `onWheel`, which is passive and so
    cannot stop the browser zooming the whole page instead.
  */
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(view.current.zoom * Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const advance = useCallback(() => go(index + 1), [go, index]);
  useAutoplay(playing && count > 1, intervalMs, advance);

  // A hidden tab is not somebody watching a slideshow — and unlike the
  // sliders this does not resume when the tab comes back: the lightbox's
  // autoplay is an override somebody sets, and hiding the tab unsets it.
  // (An event listener rather than `useDocumentHidden`, because setting
  // state from an effect on its value is what the hooks rule refuses.)
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setOverride(false); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const item = items[index];
  const close = () => ref.current?.close();

  /*
    How the pictures move between slots.

    The lightbox is a **flow** (the client's reference, 2026-09-16): the
    current picture square-on in the middle, its neighbours behind it on
    either side, turned away, blurred and dimmed, and a strip of thumbnails
    under it. Every picture within two of the current one is on the stage,
    placed by its offset — `translate`, `rotate`, `filter` and `opacity` all
    from that one number, and transitioned, so pressing Next slides the whole
    row one slot along and the picture arriving in the middle turns to face
    the front on the way (the mechanism `FanSlider` and `CardsSlider` share).

    The gallery's `transition` setting now says *how* that move is drawn:
    `slide` (the default) and `zoom` transition the whole placement, `zoom`
    with the neighbours scaled down as well; `fade` transitions only the
    opacity and the blur, so the pictures take their slots at once and
    cross-fade there; `none` and anything unrecognised transition nothing and
    the pictures simply swap — a stored value can outlive the rule that
    accepted it, and the lightbox is the wrong place to fail over one. The
    old per-picture keyframes are gone from here. Every transition sits
    behind the global reduced-motion rule, which disables them all.
  */
  const flow = transition === "slide" || transition === "zoom" ? "flow" : transition === "fade" ? "fade" : "none";
  const zoomFlow = transition === "zoom";
  const moveClass =
    flow === "flow" ? "transition-[translate,rotate,filter,opacity,scale] duration-(--duration-slow) ease-brand"
    : flow === "fade" ? "transition-[filter,opacity] duration-(--duration-slow) ease-brand"
    : "";

  // The strip follows the picture: the current thumbnail is scrolled into
  // the middle of the strip. `block: "nearest"` so nothing outside the strip
  // moves; the dialog is fixed in the top layer, so the page cannot anyway.
  useEffect(() => {
    thumbs.current.get(index)?.scrollIntoView({ inline: "center", block: "nearest", behavior: motionOk && flow !== "none" ? "smooth" : "auto" });
  }, [index, motionOk, flow]);

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
        "dialog-motion",
      )}
    >
      <div className="grid h-full grid-rows-[auto_1fr_auto_auto] gap-3 p-3 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-12 text-white/70 tabular-nums">
            {index + 1} / {count}
          </span>

          {/* Announced as it changes; the figure itself is for a screen reader. */}
          <span className="sr-only" aria-live="polite">{zoom > 1 ? `Zoomed to ${Math.round(zoom * 100)}%` : ""}</span>

          <div className="ml-auto flex items-center gap-1.5">
            <Control onClick={() => zoomTo(zoom - 0.5)} label="Zoom out" disabled={zoom <= 1}>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" /><path d="M8 11h6M16 16l4 4" />
              </svg>
            </Control>
            <Control onClick={() => zoomTo(zoom + 0.5)} label="Zoom in" disabled={zoom >= 3}>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" /><path d="M8 11h6M11 8v6M16 16l4 4" />
              </svg>
            </Control>
            {zoom > 1 && (
              <Control onClick={() => zoomTo(1)} label="Reset zoom">
                <span aria-hidden="true" className="font-mono text-12 tabular-nums">1:1</span>
              </Control>
            )}
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

        {/*
          The stage. `min-h-0` is what lets this row actually shrink: a grid
          child's automatic minimum is its content, so without it a tall
          photograph pushes the strip and the caption off the bottom of the
          screen. `overflow-hidden` because the neighbours sit partly outside
          it by design; the dialog is fixed, so nothing can widen the page
          either way.
        */}
        <div ref={stage} className="relative min-h-0 overflow-hidden [perspective:1400px]">
          <div className="stage3d absolute inset-0 [transform-style:preserve-3d]">
            {items.map((it, i) => {
              // The shortest way round the ring, so the stage is symmetric.
              let offset = i - index;
              if (offset > count / 2) offset -= count;
              if (offset < -count / 2) offset += count;
              const away = Math.abs(offset);
              if (away > 2) return null;
              const isCurrent = offset === 0;
              return (
                <div
                  key={i}
                  aria-hidden={!isCurrent || undefined}
                  className={cn(
                    "absolute inset-y-0 left-1/2 w-[86%] sm:w-[64%]",
                    moveClass,
                    !isCurrent && "overflow-hidden rounded-xl",
                  )}
                  style={{
                    // Each step back slides the picture out by 70% of its
                    // width, turns it 18° away and drops it 180px into the
                    // perspective; the blur and the dimming grow with it.
                    translate: `calc(-50% + ${offset} * 70%) 0 calc(${-away} * 180px)`,
                    rotate: `y ${-offset * 18}deg`,
                    scale: zoomFlow ? String(1 - away * 0.12) : undefined,
                    filter: away ? `blur(${away * 2}px) brightness(${1 - away * 0.28})` : undefined,
                    opacity: away === 0 ? 1 : away === 1 ? 0.75 : 0.35,
                    zIndex: 3 - away,
                  }}
                >
                  {it.url && (isCurrent ? (
                    /*
                      The current picture is sized by itself, not by the card.

                      It used to be `fill` + `object-contain`, which shows the
                      whole picture (right: this is the view somebody opened
                      in order to see all of it, and it is the one place where
                      cropping is definitely wrong) but leaves the element the
                      size of the card, so a landscape photograph in a tall
                      card was a rounded transparent box with square picture
                      corners painted in the middle of it. The client asked
                      for curved corners (2026-09-17). With auto width and
                      height under `max-h-full max-w-full` the element is
                      exactly the painted picture, `inset-0 m-auto` centres a
                      replaced element of its own size, and the radius lands
                      on the picture's own corners. `width`/`height` are only
                      the aspect hint before the bytes arrive -- no item
                      carries its dimensions -- and the browser replaces it
                      with the natural ratio on load.
                    */
                    <Image
                      ref={picture}
                      src={it.url}
                      alt={it.alt ?? ""}
                      width={1600}
                      height={1200}
                      /*
                        A wider variant once zoomed: at 3x the picture is
                        drawn three times the width it was chosen for, and
                        the 64vw file would be enlarged rather than detailed.
                      */
                      sizes={zoom > 1 ? "200vw" : "(min-width: 640px) 64vw, 86vw"}
                      draggable={false}
                      className={cn(
                        "absolute inset-0 m-auto h-auto max-h-full w-auto max-w-full touch-none rounded-xl object-contain select-none",
                        zoom > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
                        // `scale` and `translate` — never `transition-transform`,
                        // which would animate neither (the Tailwind v4 trap).
                        !dragging && "transition-[scale,translate] duration-(--duration-base) ease-brand",
                      )}
                      style={{ scale: String(zoom), translate: `${pan.x}px ${pan.y}px` }}
                      /*
                        A click zooms to 2x at the point pressed, and a second
                        click puts it back; the second press of a double-click
                        is ignored, so a double-click zooms in too. A press
                        that turned into a drag is not a click.
                      */
                      onClick={(e) => {
                        if (gesture.current.moved || e.detail > 1) return;
                        if (zoom > 1) zoomTo(1);
                        else zoomTo(2, { x: e.clientX, y: e.clientY });
                      }}
                      onPointerDown={(e) => {
                        const g = gesture.current;
                        g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                        g.moved = false;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        if (g.pointers.size === 2) {
                          const [a, b] = [...g.pointers.values()];
                          g.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
                          g.start = null;
                        } else if (zoom > 1) {
                          g.start = { x: e.clientX, y: e.clientY, pan };
                          setDragging(true);
                        }
                      }}
                      onPointerMove={(e) => {
                        const g = gesture.current;
                        if (!g.pointers.has(e.pointerId)) return;
                        g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                        if (g.pinch && g.pointers.size >= 2) {
                          const [a, b] = [...g.pointers.values()];
                          g.moved = true;
                          zoomTo(g.pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.pinch.distance), {
                            x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
                          });
                          return;
                        }
                        if (!g.start || !picture.current) return;
                        const dx = e.clientX - g.start.x;
                        const dy = e.clientY - g.start.y;
                        if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
                        setPan(clampPan({ x: g.start.pan.x + dx, y: g.start.pan.y + dy }, zoom, picture.current));
                      }}
                      onPointerUp={(e) => {
                        const g = gesture.current;
                        g.pointers.delete(e.pointerId);
                        if (g.pointers.size < 2) g.pinch = null;
                        g.start = null;
                        setDragging(false);
                      }}
                      onPointerCancel={(e) => {
                        const g = gesture.current;
                        g.pointers.delete(e.pointerId);
                        g.pinch = null;
                        g.start = null;
                        setDragging(false);
                      }}
                    />
                  ) : (
                    // The neighbours are previews, so they fill their card
                    // and the card carries the radius.
                    <Image
                      src={it.url}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 64vw, 86vw"
                      className="object-cover"
                      style={focalStyle(it.focus)}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {count > 1 && (
            <>
              <Arrow side="left" onClick={() => { setOverride(false); go(index - 1); }} />
              <Arrow side="right" onClick={() => { setOverride(false); go(index + 1); }} />
            </>
          )}
        </div>

        {/*
          The thumbnail strip: every picture, the current one framed. An inner
          `w-max` row with auto margins — centred while it fits, scrolling
          from its first tile once it does not (the shop's category rail).
        */}
        {count > 1 && (
          <div className="overflow-x-auto [scrollbar-width:none]">
            <div className="mx-auto flex w-max gap-2 px-1">
              {items.map((it, i) => (
                <button
                  key={i}
                  ref={(el) => { if (el) thumbs.current.set(i, el); else thumbs.current.delete(i); }}
                  type="button"
                  onClick={() => { setOverride(false); go(i); }}
                  aria-label={`Show picture ${i + 1}${it.title ? `: ${it.title}` : ""}`}
                  aria-current={i === index || undefined}
                  className={cn(
                    "relative h-12 w-16 shrink-0 cursor-pointer overflow-hidden rounded-md bg-white/10 transition-[opacity,box-shadow] duration-(--duration-base) sm:h-14 sm:w-20",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                    i === index ? "opacity-100 ring-2 ring-white" : "opacity-50 hover:opacity-90",
                  )}
                >
                  {it.url && <Image src={it.url} alt="" fill sizes="80px" className="object-cover" style={focalStyle(it.focus)} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/*
          The caption row is always rendered, even when the picture has neither
          a title nor a subtitle. Otherwise the stage changes height as the
          slideshow moves between a captioned picture and an uncaptioned one,
          and the whole thing jumps on its own every few seconds.
        */}
        <div className="min-h-[2.5rem] text-center">
          {item?.title && <p className="text-15 font-semibold">{item.title}</p>}
          {item?.subtitle && <p className="mt-0.5 text-13 text-white/75">{item.subtitle}</p>}
        </div>
      </div>
    </dialog>
  );
}

/**
 * How far a picture zoomed to `zoom` may be dragged before its edge comes
 * away from the frame: half of what the zoom added, either way. Read from
 * the element's layout size, which transforms do not change.
 */
function clampPan(pan: { x: number; y: number }, zoom: number, img: HTMLImageElement) {
  const maxX = ((zoom - 1) * img.offsetWidth) / 2;
  const maxY = ((zoom - 1) * img.offsetHeight) / 2;
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

function Control({
  onClick, label, children, disabled,
}: { onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="grid size-9 cursor-pointer place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/10"
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
