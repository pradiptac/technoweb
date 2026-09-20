import { Slider } from "@/components/ui/slider";
import { CardsSlider } from "@/components/ui/cards-slider";
import { FanSlider } from "@/components/ui/fan-slider";
import type { ComponentProps } from "react";

/**
 * The component a slider's `layout` asks for.
 *
 * `cards` is a well like `full` — a box of the caller's aspect ratio with the
 * pictures inside it — so it can stand anywhere `Slider` can: the homepage
 * hero, the shop's banner, a shortcode in a CMS body. Choosing here rather
 * than at each of those call sites is what keeps a layout added later from
 * being honoured on one page and silently ignored on the other two, which is
 * exactly what happened to `split` — it works only on `/store`, and
 * deliberately so: it needs the page's own background behind its words and
 * is not a well at all, which is why `StoreHero` stays a decision that page
 * makes for itself.
 *
 * A layout this file does not know renders `Slider`: a stored value outlives
 * the rule that accepted it, and a banner is the right fallback for a value
 * the console can no longer produce.
 */
export function SliderFor(props: ComponentProps<typeof Slider>) {
  if (props.slider.layout === "cards") return <CardsSlider {...props} />;
  if (props.slider.layout === "fan") return <FanSlider {...props} />;
  return <Slider {...props} />;
}
