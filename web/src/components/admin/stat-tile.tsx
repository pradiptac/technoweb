import Link from "next/link";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/sparkline";
import type { ChartTone } from "@/components/charts/tones";
import type { SVGProps } from "react";

/**
 * A dashboard figure, tinted by what it means.
 *
 * Shared rather than copied. It began on the ticket dashboard and the campaign
 * dashboard wanted the same thing — which is the point at which two tone maps
 * start drifting, and a "Bounced" tile ends up a different red from an
 * "Overdue" one for no reason anybody can name. Same argument as `TONE_BAR`
 * living beside the badge it has to match.
 *
 * **Every pairing is a `*-soft` background with its own matching text token**,
 * which is the one combination this project has proved reads in both schemes —
 * `Badge` and `Alert` use exactly it. Borders are that token at low alpha
 * rather than a fixed colour: `brand-200` and `brand-300` do *not* invert, so a
 * literal border on an inverting tint is a bright sage hairline on a near-black
 * card in dark.
 */
export type Tone = "brand" | "info" | "ok" | "warn" | "err" | "neutral";

export const TILE_TONES: Record<Tone, { skin: string; value: string; hover: string }> = {
  brand: { skin: "border-brand-ink/25 bg-brand-50", value: "text-brand-ink", hover: "hover:border-brand-ink/50" },
  info: { skin: "border-info/25 bg-info-soft", value: "text-info", hover: "hover:border-info/50" },
  ok: { skin: "border-ok/25 bg-ok-soft", value: "text-ok", hover: "hover:border-ok/50" },
  warn: { skin: "border-warn/25 bg-warn-soft", value: "text-warn", hover: "hover:border-warn/50" },
  err: { skin: "border-err/25 bg-err-soft", value: "text-err", hover: "hover:border-err/50" },
  /*
   * The one that is not a colour.
   *
   * A rate with nothing behind it is not "bad" and not "good" — it is
   * unmeasured, and giving it a hue would be the screen making a claim the data
   * does not support. Same reason the figure itself renders as an em dash
   * rather than as 0%.
   */
  neutral: { skin: "border-line-strong bg-card", value: "text-ink", hover: "hover:border-faint" },
};

/** The sparkline's colour for a tile tone: the same token, or muted for "unmeasured". */
const SPARK_TONE: Record<Tone, ChartTone> = {
  brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: "muted",
};

/**
 * "▲ 12% vs the 30 days before".
 *
 * The arrow is an SVG in the delta's colour and the words stay `ink-2`: the
 * tile's own skin is a tinted `*-soft`, and green text on a blue tint is a
 * pairing nobody measured. A graphic is held to 3:1, which the status tokens
 * clear on every soft surface; text would need 4.5:1 it does not reliably
 * get. Whether up is good is the caller's to say — more tickets is not.
 */
function Delta({ change, caption, goodWhen = "up" }: NonNullable<TileDelta>) {
  if (change === null) return caption ? <p className="mt-1 text-12 text-faint">{caption}</p> : null;
  const up = change > 0;
  const flat = change === 0;
  const good = flat || goodWhen === "neither" ? null : (up === (goodWhen === "up"));
  return (
    <p className="mt-1 flex items-center gap-1 text-12 text-ink-2">
      {!flat && (
        <svg aria-hidden viewBox="0 0 10 10" className={cn("size-2.5 shrink-0", good === null ? "text-muted" : good ? "text-ok" : "text-err", !up && "rotate-180")}>
          <path d="M5 1.5 9 8.5H1z" fill="currentColor" />
        </svg>
      )}
      <span className="font-semibold tabular-nums">{up ? "+" : ""}{change}%</span>
      {caption && <span className="truncate text-muted">{caption}</span>}
    </p>
  );
}

export type TileDelta = {
  /** Percentage change; null when the earlier figure is too small to divide by. */
  change: number | null;
  /** "vs the 30 days before", or what to say instead when `change` is null. */
  caption?: string;
  /** Which way is good news; `neither` for a figure that is only a measure of load. */
  goodWhen?: "up" | "down" | "neither";
} | undefined;

export function StatTile({
  label, value, note, href, tone, icon: Icon, compact = false, spark, delta,
}: {
  label: string;
  /** Pre-formatted, because a rate is "24%" and a count is "1,204". */
  value: string;
  note?: string;
  href?: string;
  tone: Tone;
  icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
  /**
   * The dashboard's grouped size (the client, 2026-09-29): tiles sit four to
   * a panel under a heading that already says what they are about, so the
   * figure and the glyph step down a rung and the padding tightens.
   */
  compact?: boolean;
  /** A trend under the figure — the series the figure was counted from. */
  spark?: number[];
  /** The figure against the period before. */
  delta?: TileDelta;
}) {
  const t = TILE_TONES[tone];

  /*
   * The compact tile puts the glyph on the figure's line, not beside the
   * label, so the label has the tile's whole width and stays on one line from
   * `sm` (the client, 2026-09-29: "Overdue follow-ups" and "Visits to confirm"
   * wrapped to two lines beside a glyph). Should a panel ever be narrower than
   * its longest label it ellipsises, and the full words are in `title`.
   *
   * The trend line rides on that same line, between the figure and the
   * glyph, and adds no height (the client, 2026-10-07: "why are these cards
   * not the same size?"). Under the label it made the one tile that has a
   * trend 36px taller than every tile beside it, and its whole group with it.
   */
  const compactBox = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={cn("shrink-0 font-display text-19 leading-none font-semibold tracking-[-.02em] tabular-nums", t.value)}>
          {value}
        </p>
        {spark && <Sparkline values={spark} tone={SPARK_TONE[tone]} className="h-5 min-w-0 flex-1" />}
        <Icon aria-hidden className={cn("hidden size-5 shrink-0 opacity-30 sm:block", t.value)} />
      </div>
      <p title={label} className="mt-1.5 text-13 leading-snug text-ink-2 sm:truncate">{label}</p>
      {delta && <Delta {...delta} />}
      {note && <p className="mt-1 text-12 text-faint">{note}</p>}
    </>
  );

  const box = compact ? compactBox : (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {/*
          One rung smaller below `sm` (the client, 2026-09-23). The console
          keeps its dense desktop scale — that density is the point of a tool
          worked at a desk — but a 26px figure in a tile that is the full width
          of a 390px screen is a number shouting across an empty card.
        */}
        <p className={cn("font-display text-22 leading-none font-semibold tracking-[-.02em] tabular-nums sm:text-[26px]", t.value)}>
          {value}
        </p>
        {/*
          The label stays `text-ink-2` rather than taking the tone. Six numbers
          in six colours is a dashboard; six numbers *and* six labels in six
          colours is a paint chart, and the label is the part you read to know
          what the number is.
        */}
        <p className="mt-1.5 text-13 text-ink-2">{label}</p>
        {delta && <Delta {...delta} />}
        {note && <p className="mt-1 text-12 text-faint">{note}</p>}
        {spark && <Sparkline values={spark} tone={SPARK_TONE[tone]} className="mt-2.5 h-8 w-full" />}
      </div>

      {/*
        Decoration, and hidden from the accessibility tree because it says
        nothing the label does not. It takes the tile's own tone at low alpha
        rather than a colour of its own: at full strength a 40px mark competes
        with the number, which is the thing the tile exists to show.

        `currentColor`, not an identity hue — these are used directly rather
        than through `iconMap`, and the tile has already decided what colour it
        is. Gone below `sm`, where the grid is two columns of about 140px and a
        long label already wraps to three lines; decoration does not get to
        squeeze the words that say what the number means.
      */}
      <Icon aria-hidden className={cn("hidden shrink-0 opacity-30 sm:block sm:size-9", t.value)} />
    </div>
  );

  const base = cn("block h-full min-w-0 rounded-lg border", compact ? "px-3 py-2.5" : "p-4", t.skin);

  return href ? (
    <Link
      href={href}
      className={cn(base, t.hover, "transition-all duration-(--duration-base) ease-brand hover:-translate-y-0.5 hover:shadow-2")}
    >
      {box}
    </Link>
  ) : (
    <div className={base}>{box}</div>
  );
}
