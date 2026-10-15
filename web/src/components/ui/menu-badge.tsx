import { cn } from "@/lib/utils";

/** The tones a menu item's badge may take; the API's `MenuItem::BADGE_TONES`. */
export type BadgeTone = "live" | "beta" | "soon" | "new";

const TONES: readonly string[] = ["live", "beta", "soon", "new"];

/** A tone from the wire as one this build draws; anything else is the default. */
export function badgeTone(value: string | null | undefined): BadgeTone {
  return value !== null && value !== undefined && TONES.includes(value) ? (value as BadgeTone) : "new";
}

/**
 * The small outlined status chip beside a menu entry — LIVE, BETA, SOON, NEW
 * (0.150.0, after the client's reference: uppercase, letter-spaced, a one-pixel
 * outline in the chip's own colour and no fill).
 *
 * Text and border are the same colour, so the contrast is that colour's own
 * against the panel behind it. Which colour is a rule in `globals.css` keyed on
 * `data-menu-badge`: the scheme's status tokens on a light panel (the mega menu
 * and the drawer), and the `--color-topbar-*` inks on the top bar's panel,
 * which `badgeInks()` walks to 4.5:1 on whatever colour the bar is set to.
 * Stored as typed and upper-cased here by CSS, so "Beta" and "BETA" are one
 * thing on the page.
 *
 * Decorative beside the title and read with it: it is inside the link, so a
 * screen reader hears "Cloud servers Beta".
 */
export function MenuBadge({ label, tone, className }: { label: string | null | undefined; tone?: string | null; className?: string }) {
  if (!label) return null;
  return (
    <span data-menu-badge={badgeTone(tone)} className={cn("shrink-0", className)}>
      {label}
    </span>
  );
}
