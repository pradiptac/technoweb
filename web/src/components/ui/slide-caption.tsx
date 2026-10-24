"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconArrowRight } from "@/components/icons-ui";
import { ButtonLink } from "@/components/ui/button";
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
 * So each anchor fades from a fully opaque `--color-scrim` — the theme's dark,
 * which no section background re-derives — at its own edge or
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
  "top-left": "bg-linear-to-br",
  "top-centre": "bg-linear-to-b",
  "top-right": "bg-linear-to-bl",
  "middle-left": "",
  "middle-centre": "",
  "middle-right": "",
  "bottom-left": "bg-linear-to-tr",
  "bottom-centre": "bg-linear-to-t",
  "bottom-right": "bg-linear-to-tl",
};

/*
  Text colour and shade strength (0.191.0). `light` words stand on the dark
  scrim, `dark` words on `--color-scrim-light` — both opaque at the edge, so the
  audit still sees the ground. Strength moves where the opaque stop *ends*,
  never its alpha: `soft` finishes fading sooner, `strong` holds the opaque
  colour a third of the way in. `standard` is exactly the old look. Literal
  class names throughout, or Tailwind never emits them.
*/
const TONE = {
  light: {
    from: "from-scrim", via: "via-scrim", panel: "bg-scrim",
    heading: "text-white", body: "text-[rgba(255,255,255,.85)]", kicker: "text-[rgba(255,255,255,.85)]",
    primary: "bg-card text-ink hover:bg-brand-50", second: "onDarkOutline" as const, secondClass: "border-dark-muted",
  },
  dark: {
    from: "from-scrim-light", via: "via-scrim-light", panel: "bg-scrim-light",
    heading: "text-scrim-light-ink", body: "text-scrim-light-ink", kicker: "text-scrim-light-ink",
    primary: "bg-scrim-light-ink text-scrim-light hover:opacity-90", second: "secondary" as const, secondClass: "",
  },
};
const SHADE: Record<string, { fade: string; pad: string }> = {
  soft: { fade: "to-70%", pad: "p-3 sm:p-4" },
  standard: { fade: "", pad: "p-4 sm:p-6" },
  strong: { fade: "via-35%", pad: "p-5 sm:p-8" },
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
  if (!slide.heading && !slide.caption && !slide.link_url && !slide.kicker) return null;

  // An unknown value falls back to the old look, the rule the position follows.
  const tone = slide.text_tone === "dark" ? TONE.dark : TONE.light;
  const overlay = slide.overlay === "soft" || slide.overlay === "strong" ? slide.overlay : "standard";
  const shade = SHADE[overlay]!;
  const hasSecond = Boolean(slide.link2_url && slide.link2_label);
  // The stagger counts the lines actually drawn, so a missing kicker leaves no gap in it.
  let step = 0;
  const a = {
    kicker: slide.kicker ? anim(animation, step++) : {},
    heading: slide.heading ? anim(animation, step++) : {},
    caption: slide.caption ? anim(animation, step++) : {},
    buttons: slide.link_url ? anim(animation, step++) : {},
  };

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
      The phone gutter is about the arrows, and only the middle row has to
      clear them (2026-09-23).

      The previous/next buttons are 40px inset 8px from each edge and sit at
      **half height**, so they cross a middle-row caption and nothing else. A
      flat `px-14` — 56px each side, applied to all nine anchors — spent 112px
      of a 390px screen on every slide to avoid a collision six of them cannot
      have: measured at 390px, the text column came out 198px wide, which wraps
      a heading after two words, clamps the summary mid-sentence and breaks
      "Shop the store" across three lines. That is the "meshed" caption the
      client reported.

      `px-12` is 48px, which is exactly where the arrows end, so the middle row
      still clears them and gets 16px back on each side. Every other anchor
      takes an ordinary `px-4`. Above `sm` there is room for both and the
      padding goes back to being about the picture's own margins.
    */
    <div
      className={cn(
        "absolute inset-0 flex py-5 sm:p-8",
        middle ? "px-12" : "px-4",
        ANCHOR[position],
        SCRIM[position],
        // The edge stop is opaque; strength only moves where it ends.
        SCRIM[position] && cn(tone.from, "to-transparent", overlay === "strong" && tone.via, shade.fade),
      )}
    >
      <div
        className={cn(
          /*
            Full width on a phone and shrink-to-fit above it.

            A caption box that sizes to its text is right on a wide picture,
            where a 46ch measure is a column inside a scene. On a phone there is
            no scene left to sit inside: the box is most of the slide either
            way, and letting it shrink only buys narrower lines. Full width
            takes the text column from 198px to 262px at 390px — the alignment
            classes still decide which edge the words sit against, because
            `text-*` is what actually reads.
          */
          "w-full sm:w-auto sm:max-w-[46ch]",
          // The panel the middle row needs, and nothing at all for the rows
          // that fade from an edge — a panel there would sit inside its own
          // gradient and read as a box drawn on the picture for no reason.
          // Strength widens the panel's padding only; it stays opaque.
          middle && cn("rounded-lg", tone.panel, shade.pad),
        )}
      >
        {slide.kicker && (
          <p className={cn("mb-1.5 text-12 font-semibold uppercase tracking-[.12em]", tone.kicker, a.kicker.className)} style={a.kicker.style}>
            {slide.kicker}
          </p>
        )}
        {slide.heading && (
          <p
            className={cn("font-display text-[18px] font-semibold tracking-[-.02em] sm:text-24", tone.heading, a.heading.className)}
            style={a.heading.style}
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
            className={cn("mt-1.5 line-clamp-4 text-13-5 leading-[1.5] sm:line-clamp-none sm:text-15", tone.body, a.caption.className)}
            style={a.caption.style}
          >
            {slide.caption}
          </p>
        )}
        {(slide.link_url || hasSecond) && (
          // Wraps below `sm`; the first stays the primary, the second is outlined to read on the shade.
          <div className={cn("mt-3 flex flex-wrap items-center gap-2", a.buttons.className, position.endsWith("centre") && "justify-center", position.endsWith("right") && "justify-end")} style={a.buttons.style}>
            {slide.link_url && (
              <Link
                href={slide.link_url}
                className={cn("inline-flex items-center gap-1.5 rounded px-3 py-2 text-13 font-semibold", tone.primary)}
              >
                {slide.link_label || "Read more"} <IconArrowRight className="size-3.5" />
              </Link>
            )}
            {hasSecond && (
              <ButtonLink
                href={slide.link2_url!}
                variant={tone.second}
                className={cn("rounded px-3 py-2 text-13", tone.secondClass)}
              >
                {slide.link2_label}
              </ButtonLink>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
