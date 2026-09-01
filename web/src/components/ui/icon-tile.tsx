import { IdentityIcon, iconMap } from "@/components/icons";
import type { IconName } from "@/components/icons";
import { hueFor } from "@/lib/hues";
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

/**
 * An icon in a box tinted with its own colour.
 *
 * One component because ten call sites were drawing the same square by hand and
 * had already drifted through three different fills — a brand wash, then no
 * fill at all, and now a tint of the icon's own hue. Each of those was a
 * find-and-replace across ten files, which is the argument for the eleventh
 * living here.
 *
 * **The tint is derived from the hue, not stored beside it.** `hueFor` seeds a
 * colour from the icon's own key in `iconMap`, so a new icon is coloured the
 * moment it exists — and the fill has to keep that promise or adding one would
 * mean adding a matching tint by hand. `color-mix` does it in CSS, which also
 * means the tint follows the hue automatically when a scheme flips.
 *
 * **12% is measured, not chosen.** The twelve hues were derived to clear 3:1
 * against a *plain* surface; washing the box with the icon's own colour moves
 * the background toward the glyph, so that derivation stops answering the
 * question. `scripts/icon-tile-contrast.mjs` walks the mix percentage across
 * all twelve hues in both schemes and reports the ceiling: 14% is the last that
 * clears WCAG 1.4.11's 3:1, at 3.01, and 12% leaves a little air at 3.11.
 * **Re-run it if the palette or the card colour changes.**
 *
 * `srgb` in both the check and the CSS deliberately. `oklab` mixes more
 * pleasantly and would make the number the script prints a different sum from
 * the one a browser paints.
 */
export function IconTile({
  name, fallback = "network", children, size = "md", className,
}: {
  /**
   * The `iconMap` key. Given one, the tile colours itself from it and renders
   * the icon — which is what keeps the hue in a single place.
   */
  name?: string | null;
  /**
   * What to draw when `name` is a key this build does not have. Icon names come
   * from the CMS, so a stored value can outlive the icon it referred to — and
   * the right stand-in is a property of the *list*, not of this component: a
   * missing industry should fall back to a building and a missing category to a
   * switch.
   */
  fallback?: IconName;
  /**
   * An icon that is not an identity one — a hub's own mark, an empty state's.
   * It takes the brand instead, through the same formula, so a generic tile is
   * the same shape as a coloured one rather than a different component.
   */
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  // Resolved exactly the way `IdentityIcon` resolves it, so an unknown stored
  // name cannot tint the box from one hue while the glyph inside it is drawn in
  // another.
  const key = !name ? undefined : name in iconMap ? (name as IconName) : fallback;
  const hue = key ? hueFor(key) : "var(--color-brand-ink)";

  const box = {
    sm: "size-7 rounded [&_svg]:size-[18px]",
    md: "size-9 rounded-lg [&_svg]:size-5",
    lg: "size-11 rounded-xl [&_svg]:size-6",
  }[size];

  return (
    <span
      className={cn("grid shrink-0 place-items-center border", box, className)}
      style={{
        // The wash, and a stronger pour of the same colour for the edge — one
        // hue, two strengths, so the box cannot disagree with what is in it.
        background: `color-mix(in srgb, ${hue} 12%, var(--color-card))`,
        borderColor: `color-mix(in srgb, ${hue} 30%, var(--color-card))`,
        color: hue,
      } as CSSProperties}
    >
      {name ? <IdentityIcon name={name} fallback={fallback} /> : children}
    </span>
  );
}
