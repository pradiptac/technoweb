import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { IconTile } from "@/components/ui/icon-tile";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn(
      "rounded-lg border border-line-strong bg-card p-[26px]",
      "transition-all duration-200 ease-brand",
      "hover:border-brand-300 hover:shadow-2 hover:-translate-y-0.5",
      className,
    )}>
      {children}
    </div>
  );
}

/**
 * The icon tile and the card's title, on one line.
 *
 * They used to stack, which spent a 40px tile plus 18px of margin on a
 * decoration before the reader reached the only line that says what the card
 * is. Side by side the tile reads as a marker *for* the heading, the title
 * sits directly above the summary it introduces, and every card in the grid
 * loses the same ~58px of height.
 *
 * `items-center` rather than `items-start` because a title that wraps to two
 * lines is the common case at `sm`, and a tile pinned to the first line of two
 * looks like it belongs to that line alone.
 *
 * The heading level is a prop: these cards sit under an `h1` on one page and
 * under an `h2` on another, and the outline has to stay valid in both.
 */
export function CardHead({
  icon, iconName, as: Tag = "h3", className, children,
}: {
  /**
   * An already-rendered icon, for a card whose mark is not in `iconMap`.
   *
   * Prefer `iconName`. A rendered element carries its colour inline and the
   * tile cannot read it back, so a card passed one gets the brand tint however
   * fluorescent the glyph inside it is — which is how every solution card ended
   * up with the same fill and nine different icons.
   */
  icon?: ReactNode;
  /** The `iconMap` key, which is what lets the tile take the icon's own hue. */
  iconName?: string | null;
  as?: "h2" | "h3";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3.5">
      <IconTile size="lg" name={iconName}>{icon}</IconTile>
      <Tag className={cn("min-w-0 text-[17.5px] leading-snug", className)}>{children}</Tag>
    </div>
  );
}

export function SectionHeader({
  kicker, title, lede, className,
}: { kicker?: string; title: string; lede?: string; className?: string }) {
  return (
    <div className={cn("mb-11 max-w-[64ch]", className)}>
      {kicker && (
        <span className="text-[11.5px] font-semibold uppercase tracking-[.13em] text-brand-ink">
          {kicker}
        </span>
      )}
      <h2 className="display-2 mt-3.5">{title}</h2>
      {lede && <p className="lede mt-4">{lede}</p>}
    </div>
  );
}
