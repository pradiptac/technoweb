import type { Slider } from "@/types/api";

/**
 * The attributes that tell `.slider-frame` (globals.css) how tall a slider is.
 *
 * Nothing is emitted for `theme` — the caller's `aspect` still sets the shape
 * and the frame is only capped to the screen. `screen` and `fixed` switch the
 * aspect off; the fixed step names are the API's, read by one CSS block.
 */
export function sliderFrameAttrs(slider: Pick<Slider, "height" | "height_mobile" | "height_desktop">) {
  const fixed = slider.height === "fixed";
  return {
    "data-height": fixed || slider.height === "screen" ? slider.height : undefined,
    "data-h-mobile": fixed ? slider.height_mobile ?? undefined : undefined,
    "data-h-desktop": fixed ? slider.height_desktop ?? undefined : undefined,
  };
}
