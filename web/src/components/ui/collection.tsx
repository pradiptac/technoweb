import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { IconArrowRight } from "@/components/icons";
import { BorderBeam } from "@/components/velora/border-beam";
import { cn } from "@/lib/utils";

/**
 * A collection: every list of like things on the public site, in one
 * anatomy — and the anatomy is what a theme redraws.
 *
 * The homepage's Products, Industries, Web services, Case studies and
 * Resources sections, the seven index pages behind them, the support and
 * resources hubs and the shop's grids all used to hand-roll their own
 * `rounded-lg border bg-card` tiles: nineteen copies of one recipe, and
 * under every theme but classic they looked exactly the same, because a
 * theme's CSS can only reach markup that says what it is. The client's
 * review on 2026-09-18 named the seven sections, and `/store`, as "the
 * same under every theme". This is the fix: one `<ul data-collection>`
 * and one `[data-tile]` whose parts are named —
 *
 *   <a data-card data-tile>
 *     <span data-tile-media>   a picture or an icon well, 4:3 (optional)
 *     <div data-tile-body>
 *       <span data-tile-kicker>   the industry, the brand (optional)
 *       <div data-tile-head>      the identity icon beside the title
 *         <span data-tile-icon>
 *         <h3 data-tile-title>
 *       <p data-tile-summary>
 *       <div data-tile-meta>      a date, a result, a note (optional)
 *       <span data-tile-cta>      "Learn more" (optional)
 *
 * — and each theme's `theme.css` carries an **idiom** block keyed on
 * `[data-collection]` that lays those parts out in its own vocabulary:
 * Editorial as a ruled index, Datacenter as a numbered rack, Terminal as
 * an `ls` listing, Launch as a bento with a lead tile, Vantage as a photo
 * mosaic with the words on the picture's foot, and so on. The markup and
 * the words are the same under every theme, which is what keeps the audits
 * and the screen readers reading one page; the tile's base look here is
 * classic's, and classic's idiom block is empty.
 *
 * Two rules the idioms depend on. **The tile's ground is a rule in
 * `globals.css`, not the `bg-card` utility**: the site-wide "never a card
 * without a ground" rule is written against `.bg-card` at a specificity a
 * theme cannot beat, so the tile takes the same gradient from
 * `.public-site [data-tile]` instead, which a theme's three-attribute
 * idiom selector outranks. And **every part is a direct child of the body
 * (the media a sibling of it)**, so an idiom can turn a column into a row
 * with one `grid-template-columns` and `grid-area`s — a part nested one
 * level deeper is one an idiom cannot move.
 *
 * A tile carries no count beside its name — a category's product count
 * was drawn there until 2026-09-19 and the client asked for it to go, in
 * every theme. A tile whose whole face navigates
 * is a `Link` and holds no other interactive element; the shop's product
 * card, which holds buttons, stamps the same parts on an `<article>` of
 * its own.
 */

const COLS = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  6: "min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6",
} as const;

export function Collection({
  kind, cols = 3, as: Tag = "ul", gap = "md", className, children, ...rest
}: {
  /** What the tiles are — `industries`, `categories`, `case-studies` … — so an idiom can treat one kind specially. */
  kind: string;
  cols?: keyof typeof COLS;
  as?: "ul" | "div";
  gap?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <Tag
      data-collection={kind}
      data-cols={cols}
      className={cn("grid", { sm: "gap-3", md: "gap-4", lg: "gap-5" }[gap], COLS[cols], className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Tile({
  href, as, title, titleAs: Heading = "h3", kicker, summary, icon, media, focus, meta, cta, hue,
  padding = "md", beam = false, className, style, children, ...rest
}: {
  /** The whole tile navigates. */
  href?: string;
  /** The item element around the tile; `li` inside a `ul` collection, `div` inside a `div` one. */
  as?: "li" | "div";
  title: ReactNode;
  /** The outline decides: `h2` under a page's own `h1`, `h3` under a section's `h2`, `b` where the tile is not a heading. */
  titleAs?: "h2" | "h3" | "b" | "span";
  kicker?: ReactNode;
  summary?: ReactNode;
  /** An `IconTile`, drawn beside the title. */
  icon?: ReactNode;
  /** A picture in a 4:3 well, or an icon well of the tile's own hue. */
  media?: ReactNode;
  /**
   * The picture's focal point, the record's `*_focus` — `"30% 20%"` or
   * null. Set on the media well as `--tile-focus`, which the rule in
   * `globals.css` hands to the `<img>` inside as `object-position`, so a
   * caller passes the point once beside the picture and never reaches into
   * the element it handed over. Unset is the centre, as it always was.
   */
  focus?: string | null;
  meta?: ReactNode;
  /**
   * The closing line — "Learn more". Hidden by the base rule in
   * `globals.css`, because the classic tile has never carried one and the
   * whole face is the link; an idiom that ends its tile on a text link
   * (Enterprise, Horizon, Canvas) shows it. It is in the markup either
   * way, so the link an idiom shows is a real one and not CSS content.
   */
  cta?: ReactNode;
  /** The identity hue of the tile's icon, for the wash and for `--tile-hue`. */
  hue?: string;
  padding?: "sm" | "md";
  beam?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Anything else in the body, after the meta. */
  children?: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const Item = as ?? "li";
  const face = cn(
    "group relative flex h-full flex-col overflow-hidden rounded-lg border border-line-strong",
    href && "transition-[border-color,box-shadow,translate] duration-(--duration-base) ease-brand hover:border-brand-300 hover:shadow-2 hover:-translate-y-0.5",
    className,
  );
  const styles: CSSProperties = {
    ...(hue ? ({ "--tile-hue": hue } as CSSProperties) : {}),
    ...style,
  };
  const body = (
    <>
      {beam && <BorderBeam ring={2} size={120} />}
      {media && (
        <span
          data-tile-media
          className="relative block aspect-[4/3] overflow-hidden bg-surface-2"
          style={focus ? ({ "--tile-focus": focus } as CSSProperties) : undefined}
        >
          {media}
        </span>
      )}
      <div data-tile-body className={cn("flex min-w-0 flex-1 flex-col", padding === "sm" ? "p-4" : "p-5")}>
        {kicker && (
          <span data-tile-kicker className="mb-1.5 text-11 font-semibold uppercase tracking-[.1em] text-secondary-ink">
            {kicker}
          </span>
        )}
        <div data-tile-head className="flex min-w-0 items-center gap-3">
          {icon && <span data-tile-icon className="shrink-0">{icon}</span>}
          <Heading data-tile-title className="min-w-0 text-15-5 font-semibold leading-snug text-ink">{title}</Heading>
        </div>
        {summary && <p data-tile-summary className="mt-1.5 text-13-5 leading-[1.55] text-muted">{summary}</p>}
        {meta && <div data-tile-meta className="mt-3 text-12-5 text-muted">{meta}</div>}
        {children}
        {cta && (
          <span data-tile-cta className="mt-auto inline-flex items-center gap-1 pt-4 text-13-5 font-semibold text-brand-ink">
            {cta} <IconArrowRight className="size-3.5" />
          </span>
        )}
      </div>
    </>
  );

  return (
    <Item className="min-w-0" {...rest}>
      {href
        ? <Link href={href} data-card data-tile className={face} style={styles}>{body}</Link>
        : <div data-card data-tile className={face} style={styles}>{body}</div>}
    </Item>
  );
}
