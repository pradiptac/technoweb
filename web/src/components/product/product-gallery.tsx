"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Image from "next/image";
import { focalStyle } from "@/lib/focal";
import { cn } from "@/lib/utils";
import { IconBox, IconZoomIn } from "@/components/icons-ui";
import { Lightbox } from "@/components/ui/gallery";
import { PlayDisc, ProductVideoPlayer } from "@/components/product/product-video";
import type { GalleryItem } from "@/types/api";
import type { ProductVideo } from "@/types/store-merch";

/**
 * The picture half of a product page: one large well and a row of thumbnails
 * that change what is in it.
 *
 * Shared by the catalogue's product page and the shop's, because a product is
 * the same object on both and it should not be photographed differently
 * depending on which listing somebody arrived from. The two pages differ in
 * what sits *beside* this — a price and a basket on one, a datasheet and an
 * enquiry on the other — and that is where the two pages diverge.
 *
 * **The thumbnails are buttons, not links.** They change the picture in place
 * rather than navigating, so they have to be reachable by keyboard and
 * announce which one is showing; `aria-current` does that without inventing a
 * widget role for what is really a set of view choices.
 *
 * The well is a fixed 4:3 at every width, matching the cards in the shop.
 * A ratio rather than a height is what makes it hold from a 320px phone to a
 * wide monitor, and it means a slow image cannot move the price out from under
 * somebody's cursor — the rule every image on this site follows.
 *
 * **`store` switches on the shop's additions (2026-09-26), and the catalogue
 * passes nothing, so its page is unchanged**: the product's videos after its
 * pictures, a thumbnail for every picture in a strip that scrolls rather
 * than the first five, and a hover magnifier in the well.
 */
export function ProductGallery({
  images, alts, focuses, name, priority = false, videos = [], store = false,
}: {
  images: string[];
  /** From the media library, resolved by path — a description of the picture. */
  alts?: (string | null)[];
  /** Parallel to `images` too: each file's focal point, or null for the centre. */
  focuses?: (string | null)[];
  /** The fallback alt, and only ever the product's name. */
  name: string;
  priority?: boolean;
  /** The shop's videos, shown after the pictures. Ignored unless `store`. */
  videos?: ProductVideo[];
  store?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const clips = store ? videos : [];
  const slots = images.length + clips.length;
  const onVideo = index >= images.length;
  const shown = onVideo ? undefined : images[index];
  /*
    The shop's hover magnifier: the picture at twice its size inside the
    well, its `transform-origin` following the pointer so the part under the
    cursor is the part enlarged.

    **Only where it can mean anything** — from `lg`, on a device that hovers
    with a fine pointer — asked of `matchMedia` on each entry rather than
    once, so a window resized past the breakpoint behaves. A touch screen
    never sees it: there is no hover to follow, and the lightbox's pinch is
    the zoom there.

    Written to the `<img>`'s style directly rather than through state: a
    pointer move is sixty renders a second otherwise, of a component holding
    the whole gallery. The `scale` property, never `transform`, so it
    transitions through the utility on the image; the global reduced-motion
    rule removes the transition and leaves the zoom. The well stays the
    lightbox's button — a click resets the magnifier first.
  */
  const picture = useRef<HTMLImageElement | null>(null);
  const magnifying = useRef(false);
  const aim = (e: ReactPointerEvent<HTMLElement>) => {
    const img = picture.current;
    if (!img) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100));
    img.style.transformOrigin = `${x}% ${y}%`;
  };
  const unmagnify = () => {
    magnifying.current = false;
    if (picture.current) picture.current.style.scale = "";
  };
  const magnify = (e: ReactPointerEvent<HTMLElement>) => {
    if (!store || !shown || e.pointerType !== "mouse") return;
    if (!window.matchMedia("(min-width: 64rem) and (hover: hover) and (pointer: fine)").matches) return;
    magnifying.current = true;
    aim(e);
    if (picture.current) picture.current.style.scale = "2";
  };

  // The gallery's lightbox reads `GalleryItem`s; a product's pictures are
  // paths with alt text and nothing else, so the rest is null.
  const items: GalleryItem[] = images.map((url, i) => ({
    id: i, url, alt: alts?.[i] ?? name, focus: focuses?.[i] ?? null, title: null, subtitle: null, link_url: null, group: null,
  }));

  return (
    <div className="grid min-w-0 gap-3">
      {onVideo ? (
        /*
          A video's well is not the lightbox's button: the player is the
          control, and a button inside a button is two controls fighting over
          one press. Keyed on the slot so moving between two videos starts
          each at its facade rather than inheriting the other's iframe.
        */
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line-strong bg-dark">
          <ProductVideoPlayer key={index} video={clips[index - images.length]} name={name} />
        </div>
      ) : (
      /*
        The main picture is a button that opens the lightbox — the thumbnails
        swap it in place, and the well is 4:3 of half the page, which is small
        for a rack switch's port layout. The glyph in the corner says it
        opens; the ring says it is focusable.
      */
      <button
        type="button"
        onClick={() => { unmagnify(); if (shown) setOpen(true); }}
        disabled={!shown}
        aria-label={shown ? "Open the picture full size" : undefined}
        onPointerEnter={magnify}
        onPointerMove={(e) => { if (magnifying.current) aim(e); }}
        onPointerLeave={unmagnify}
        className="group relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl border border-line-strong bg-surface text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-default"
      >
        {shown ? (
          <Image
            // Keyed on the source so switching remounts rather than re-pointing
            // an existing element — the entrance animation restarts, which is
            // what makes the change read as a change.
            key={shown}
            ref={picture}
            src={shown}
            alt={alts?.[index] ?? name}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className={cn(
              "object-cover motion-safe:animate-[gallery-fade_.35s_ease-out]",
              // The magnifier's `scale`, transitioned as `scale` — the
              // Tailwind v4 trap: `transition-transform` would animate nothing.
              store && "transition-[scale] duration-(--duration-slow) ease-brand",
            )}
            style={focalStyle(focuses?.[index])}
            priority={priority}
          />
        ) : (
          <span className="text-faint"><IconBox className="size-10" /></span>
        )}
        {shown && (
          <span aria-hidden className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full border border-line-strong bg-card/90 text-ink opacity-0 transition-opacity duration-(--duration-base) group-hover:opacity-100 group-focus-visible:opacity-100">
            <IconZoomIn className="size-4" />
          </span>
        )}
      </button>
      )}

      {open && (
        <Lightbox items={items} start={Math.min(index, Math.max(images.length - 1, 0))} autoplay={false} intervalMs={0} transition="fade" onClose={() => setOpen(false)} />
      )}

      {store ? (
        slots > 1 && (
          /*
            Every picture and every video, five across and scrolling past that.
            `w-0 min-w-full`: a scroll container still hands its content's
            min-content width to the grid item holding it, so without it a
            twelve-picture product widens the whole column at 360px.
          */
          <ul className="flex w-0 min-w-full gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {images.map((src, i) => (
              <li key={src} className="w-[calc((100%-2.5rem)/5)] shrink-0">
                <Thumb
                  current={i === index}
                  onClick={() => setIndex(i)}
                  label={`Show image ${i + 1} of ${images.length}`}
                >
                  <Image src={src} alt="" fill sizes="120px" className="object-cover" style={focalStyle(focuses?.[i])} />
                </Thumb>
              </li>
            ))}
            {clips.map((video, v) => (
              <li key={`video-${v}`} className="w-[calc((100%-2.5rem)/5)] shrink-0">
                <Thumb
                  current={images.length + v === index}
                  onClick={() => setIndex(images.length + v)}
                  label={`Show video ${v + 1} of ${clips.length}${video.title ? `: ${video.title}` : ""}`}
                  dark
                >
                  {video.poster_url && <Image src={video.poster_url} alt="" fill sizes="120px" className="object-cover" />}
                  <PlayDisc className="relative size-7" />
                </Thumb>
              </li>
            ))}
          </ul>
        )
      ) : (
      images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2.5">
          {images.slice(0, 5).map((src, i) => (
            <li key={src}>
              <Thumb
                current={i === index}
                onClick={() => setIndex(i)}
                label={`Show image ${i + 1} of ${Math.min(images.length, 5)}`}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                  style={focalStyle(focuses?.[i])}
                />
              </Thumb>
            </li>
          ))}
        </ul>
      )
      )}
    </div>
  );
}

/*
  The selected thumbnail is marked with a ring rather than by dimming the
  others: dimming reads as "these are unavailable" on a control whose whole
  job is to be pressed.
*/
function Thumb({
  current, onClick, label, dark = false, children,
}: {
  current: boolean;
  onClick: () => void;
  label: string;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "true" : undefined}
      aria-label={label}
      className={cn(
        "group relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-lg border transition-colors duration-(--duration-base)",
        dark && "bg-linear-135 from-dark to-brand-900",
        current ? "border-brand-600 ring-2 ring-brand-100" : "border-line-strong hover:border-brand-300",
      )}
    >
      {children}
    </button>
  );
}

