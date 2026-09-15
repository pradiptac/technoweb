import { cn } from "@/lib/utils";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { IconTile } from "@/components/ui/icon-tile";
import { BorderBeam } from "@/components/velora/border-beam";

/**
 * The wash a card takes from the identity icon it carries: the same
 * `color-mix` its `IconTile` uses for its fill, at a lighter percentage —
 * the tile is a small square that can carry a stronger wash, and the same
 * strength over a whole card would compete with the copy on it. Diagonal
 * rather than flat, so it reads as light falling on the card. Exported
 * because the homepage's link cards used to reproduce the formula by hand
 * (they could not be a `Card` while it rendered a `<div>`), and two copies
 * of one gradient drift.
 */
export function cardTint(hue: string): CSSProperties {
  return {
    background: `linear-gradient(155deg, color-mix(in srgb, ${hue} 10%, var(--color-card)) 0%, var(--color-card) 60%)`,
  };
}

const PADDING = { none: "", sm: "p-4", md: "p-5", lg: "p-[26px]" } as const;

/**
 * The site's card, in its three shapes: a hover-lifting panel (the default,
 * what every public grid renders), a **static** panel for the console and
 * the portal (`interactive={false}` — a record's details are not pressable
 * and a lift under the pointer says otherwise), and a **link** (`href`) for a
 * grid whose whole tile navigates. Before the last two existed the static
 * recipe was hand-rolled ~170 times and the link one six, each free to drift
 * from the others; `as` is what lets a static card be the `<section>` or
 * `<li>` the markup around it wants, and `padding` what lets the console's
 * denser panels stay dense.
 *
 * A link card must hold no other interactive element — an anchor inside an
 * anchor is invalid and the inner one is unreachable.
 */
export function Card({
  as = "div", href, interactive = true, padding = "lg", id, className, style, tint, beam = false, children,
}: {
  id?: string;
  as?: "div" | "section" | "article" | "li";
  /** Renders the card as a `Link`; `as` is ignored. */
  href?: string;
  /** The hover lift, border and shadow. Off for a panel that is not pressable. */
  interactive?: boolean;
  padding?: keyof typeof PADDING;
  className?: string;
  style?: CSSProperties;
  /**
   * Velora's border beam, travelling the card's edge under the pointer.
   * Opt-in, because `Card` is also the console's (applications, customers),
   * where decoration in motion beside a queue is noise; the public grids
   * pass it.
   */
  beam?: boolean;
  /** A hue (from `hueForIcon`) to wash the card in — see `cardTint`. */
  tint?: string;
  children: ReactNode;
}) {
  const classes = cn(
    "relative rounded-lg border border-line-strong bg-card",
    PADDING[padding],
    interactive && "transition-[border-color,box-shadow,translate] duration-(--duration-base) ease-brand hover:border-brand-300 hover:shadow-2 hover:-translate-y-0.5",
    href && "block",
    className,
  );
  const styles = tint ? { ...cardTint(tint), ...style } : style;
  const body = (
    <>
      {beam && <BorderBeam ring={2} size={120} />}
      {children}
    </>
  );

  if (href) {
    return <Link href={href} id={id} className={classes} style={styles}>{body}</Link>;
  }
  const Tag = as;
  return <Tag id={id} className={classes} style={styles}>{body}</Tag>;
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

/**
 * A section's kicker, title and lede, the same shape `PageHero` draws one
 * level up.
 *
 * No width cap on the block, for the reason `PageHero` dropped its own:
 * `display-2` is set for shape rather than for reading, and a `max-w-[64ch]`
 * here broke "Infrastructure built once, supported for years." after
 * "once," at 1440px with half the container empty beside it, which reads as
 * a rendering fault rather than as typesetting. The heading takes the full
 * container and wraps only when it genuinely runs out of room, balanced so
 * the last word is never alone on its own line. The lede is uncapped too,
 * by decision rather than oversight: it is one sentence under a full-width
 * heading, and held to `.measure` it wrapped onto a second line at 1440px
 * with the heading above it running the whole container. That trades the
 * 92ch ceiling for the sentence and the title sharing one edge; a lede long
 * enough to need the measure is a lede too long for a section header.
 */
export function SectionHeader({
  kicker, title, lede, className,
}: { kicker?: string; title: string; lede?: string; className?: string }) {
  return (
    <div className={cn("mb-11", className)}>
      {/* Secondary's job on the public site: the eyebrow over a heading. */}
      {kicker && (
        <span className="text-11-5 font-semibold uppercase tracking-[.13em] text-secondary-ink">
          {kicker}
        </span>
      )}
      <h2 className="display-2 mt-3.5 text-balance">{title}</h2>
      {lede && <p className="lede mt-4">{lede}</p>}
    </div>
  );
}
