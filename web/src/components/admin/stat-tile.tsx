import Link from "next/link";
import { cn } from "@/lib/utils";
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

export function StatTile({
  label, value, note, href, tone, icon: Icon,
}: {
  label: string;
  /** Pre-formatted, because a rate is "24%" and a count is "1,204". */
  value: string;
  note?: string;
  href?: string;
  tone: Tone;
  icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
}) {
  const t = TILE_TONES[tone];

  const box = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={cn("font-display text-[26px] leading-none font-semibold tracking-[-.02em] tabular-nums", t.value)}>
          {value}
        </p>
        {/*
          The label stays `text-ink-2` rather than taking the tone. Six numbers
          in six colours is a dashboard; six numbers *and* six labels in six
          colours is a paint chart, and the label is the part you read to know
          what the number is.
        */}
        <p className="mt-1.5 text-[13px] text-ink-2">{label}</p>
        {note && <p className="mt-1 text-[12px] text-faint">{note}</p>}
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

  const base = cn("block rounded-lg border p-4", t.skin);

  return href ? (
    <Link
      href={href}
      className={cn(base, t.hover, "transition-all duration-200 ease-brand hover:-translate-y-0.5 hover:shadow-2")}
    >
      {box}
    </Link>
  ) : (
    <div className={base}>{box}</div>
  );
}
