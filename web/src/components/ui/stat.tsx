import type { CSSProperties } from "react";
import { IdentityIcon, iconMap } from "@/components/icons";
import { STAT_PX, type StatLook } from "@/lib/stat-look";
import type { StatPair } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

/**
 * One homepage statistic — the figure, its label, and the icon its row
 * names — drawn the way Settings → Homepage asks (`lib/stat-look.ts`).
 *
 * The container, not the figure, carries the look: it takes the
 * `stat-figures` class, and `statFigures(look)` returns the `data-on-dark`
 * mark and the inline custom properties that `globals.css` resolves into
 * `--stat-ink` per ground, so a row of four figures sets them once. The figure reads `--stat-ink` for
 * its colour and `--stat-size` for its size, so every renderer — the
 * classic hero, the support band, a theme's readout strip or tiles — draws
 * the same figure whatever it puts around it. The icon is an identity icon
 * (coloured from its own key, the rule every identity icon follows) and is
 * drawn only for a key the build has; a stored key that has since gone
 * draws nothing rather than a wrong glyph.
 */
export function statFigures(look: StatLook, onDark = false): { style: CSSProperties; "data-on-dark"?: "" } {
  return {
    style: {
      "--stat-size": STAT_PX[look.size],
      ...(look.ink ? { "--stat-ink-light": look.ink.light, "--stat-ink-dark": look.ink.dark, "--stat-ink-band": look.ink.band } : {}),
    } as CSSProperties,
    ...(onDark ? { "data-on-dark": "" as const } : {}),
  };
}

export function StatFigure({
  stat, onDark = false, inline = false, className, labelClassName,
}: {
  stat: StatPair;
  /** On a dark band: the label takes the band's muted ink. */
  onDark?: boolean;
  /** Figure and label on one line, the readout-strip shape. */
  inline?: boolean;
  className?: string;
  labelClassName?: string;
}) {
  const icon = stat.icon && stat.icon in iconMap ? stat.icon : null;
  return (
    <span className={cn(inline ? "inline-flex items-baseline gap-2.5" : "block", className)}>
      {icon && (
        <IdentityIcon name={icon} className={cn("shrink-0 self-center", inline ? "size-[1.1em]" : "mb-1.5 block size-6")} />
      )}
      <b className="font-display text-(length:--stat-size) font-bold leading-none tracking-[-.03em] text-(--stat-ink)">{stat.value}</b>
      <span className={cn(inline ? "" : "mt-1.5 block", "text-13", onDark ? "text-dark-muted" : "text-muted", labelClassName)}>{stat.label}</span>
    </span>
  );
}
