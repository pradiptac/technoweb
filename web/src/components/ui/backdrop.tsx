import { cn } from "@/lib/utils";
import type { HeroVariant } from "@/lib/motion-choices";

/**
 * The decoration behind a heading — the homepage hero, a page banner with no
 * photograph, the closing CTA card — chosen by the `motion_hero` setting.
 *
 * `grid` is the blueprint grid the site has always drawn, and each host
 * passes its own `size` and `mask` so the default renders byte-for-byte
 * what the inline `div` it replaced rendered. `dots` is the same mask over a
 * dot field. `aurora` is three soft washes in the theme's hues, each pinned
 * to its own region (`.aurora-a/b/c` in globals.css) and drifting less than
 * the distance to its neighbours, so no two ever overlap: that is what lets
 * `npm run themes` bound the worst case as *one* tint over the ground —
 * stacked tints would compound past what any single opacity was tuned for.
 * `none` renders nothing.
 *
 * `tone` says what the host is: `light` for the page surface, `dark` for a
 * `bg-dark` band, `brand` for the `bg-brand-900` card. It picks the line
 * colour for the grid and the dots, and for the aurora the tint — the light
 * `300` steps on a light ground, the `500`s on a dark one, where a light
 * tint would wash out the text. The opacity is `--aurora-alpha`, switched
 * per scheme in globals.css, and `npm run themes` bounds every text token
 * over every tint at the same two numbers (`AURORA_ALPHA` in
 * motion-choices.ts).
 *
 * The host is expected to be `relative overflow-hidden`, which all three
 * are — a blurred blob past the edge of an unclipped host is horizontal
 * overflow, and the audit's tolerance for that is zero.
 */
export type BackdropVariant = HeroVariant;
export type BackdropTone = "light" | "dark" | "brand";

const lines: Record<BackdropTone, string> = {
  light: "var(--color-line)",
  dark: "var(--color-dark-line)",
  brand: "rgba(255,255,255,.05)",
};

const tints: Record<BackdropTone, [string, string, string]> = {
  light: ["var(--color-brand-300)", "var(--color-secondary-300)", "var(--color-accent-300)"],
  dark: ["var(--color-brand-500)", "var(--color-secondary-500)", "var(--color-accent-500)"],
  brand: ["var(--color-brand-500)", "var(--color-secondary-500)", "var(--color-accent-500)"],
};

export function Backdrop({
  variant,
  tone = "light",
  size = 56,
  mask = "radial-gradient(ellipse 80% 60% at 50% 0%, #000 20%, transparent 75%)",
  className,
}: {
  variant: BackdropVariant;
  tone?: BackdropTone;
  /** The grid pitch in pixels; dots use a fixed 24px. */
  size?: number;
  /** The fade that keeps the pattern to the top of the host. */
  mask?: string;
  className?: string;
}) {
  if (variant === "none") return null;

  const base = "pointer-events-none absolute inset-0";
  const line = lines[tone];

  if (variant === "grid") {
    return (
      <div
        aria-hidden
        className={cn(base, className)}
        style={{
          backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
          backgroundSize: `${size}px ${size}px`,
          maskImage: mask,
        }}
      />
    );
  }

  if (variant === "dots") {
    return (
      <div
        aria-hidden
        className={cn(base, className)}
        style={{
          backgroundImage: `radial-gradient(${line} 1px, transparent 1.5px)`,
          backgroundSize: "24px 24px",
          maskImage: mask,
        }}
      />
    );
  }

  const [a, b, c] = tints[tone];
  return (
    <div aria-hidden className={cn(base, "overflow-hidden", className)}>
      <div className="aurora-blob aurora-a" style={{ background: a }} />
      <div className="aurora-blob aurora-b" style={{ background: b }} />
      <div className="aurora-blob aurora-c" style={{ background: c }} />
    </div>
  );
}
