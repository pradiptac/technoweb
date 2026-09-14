"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconArrowRight } from "@/components/icons-ui";
import type { Slider as SliderData, Slide } from "@/types/api";

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

const CAPTION_ANIMATIONS = new Set(["none", "fade", "rise", "slide", "zoom"]);

/**
 * How the words arrive, separately from how the picture does. An unknown
 * value renders no animation class — the rule the transition follows. Shared
 * with `CardsSlider`, which honours the setting while ignoring `transition`.
 */
export function captionAnimationFor(slider: SliderData): string {
  return CAPTION_ANIMATIONS.has(slider.caption_animation ?? "") ? (slider.caption_animation as string) : "none";
}

/** The class and stagger index for one line of the caption, or nothing for `none`. */
function anim(animation: string, i: number): { className?: string; style?: CSSProperties } {
  if (animation === "none") return {};
  return { className: `caption-anim-${animation}`, style: { "--i": i } as CSSProperties };
}

export function SlideCaption({ slide, animation = "none" }: { slide: Slide; animation?: string }) {
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
          <p
            className={cn("font-display text-[18px] font-semibold tracking-[-.02em] text-white sm:text-24", anim(animation, 0).className)}
            style={anim(animation, 0).style}
          >
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
          <p
            className={cn("mt-1.5 line-clamp-4 text-13-5 leading-[1.5] text-[rgba(255,255,255,.85)] sm:line-clamp-none sm:text-15", anim(animation, 1).className)}
            style={anim(animation, 1).style}
          >
            {slide.caption}
          </p>
        )}
        {slide.link_url && (
          <Link
            href={slide.link_url}
            className={cn("mt-3 inline-flex items-center gap-1.5 rounded bg-card px-3 py-2 text-13 font-semibold text-ink hover:bg-brand-50", anim(animation, 2).className)}
            style={anim(animation, 2).style}
          >
            {slide.link_label || "Read more"} <IconArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
