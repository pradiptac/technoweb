import Link from "next/link";
import { cn } from "@/lib/utils";
import type { SeoBand, SeoMeta, SeoTopIssue } from "@/types/api";

/**
 * The site-wide figure, and the two primitives the per-row cells share.
 *
 * A score on its own is a number nobody can act on — it says there is a
 * problem and not one thing to do about it. Everything here is therefore a
 * link: the band chips filter to the records in that band, and each of the
 * biggest wins filters to the records failing that one check. The headline is
 * the way in, not the answer.
 *
 * `RecordScore` and the Recheck button live in `row-score.tsx`, because they
 * are client components and this card is not — keeping them here would push
 * the whole file, and the site card with it, into the client bundle for no
 * reason.
 */

export const BAND: Record<SeoBand, { label: string; text: string; soft: string }> = {
  good: { label: "Good", text: "text-ok", soft: "bg-ok-soft" },
  fair: { label: "Fair", text: "text-warn", soft: "bg-warn-soft" },
  poor: { label: "Poor", text: "text-err", soft: "bg-err-soft" },
};

/**
 * Where each colour of the gauge's ramp sits, as a percentage of the arc.
 * Placed against the bands `ScoresChecks::band()` draws — poor under 50, fair
 * to 79, good from 80 — so the tip of a poor score is red or orange, a fair one
 * orange into yellow, and a good one green: the ring and the figure's own
 * colour cannot tell two different stories about one number.
 */
const GAUGE_STOPS: ReadonlyArray<[number, string]> = [
  [0, "var(--color-gauge-0)"],
  [35, "var(--color-gauge-1)"],
  [60, "var(--color-gauge-2)"],
  [80, "var(--color-gauge-3)"],
  [100, "var(--color-gauge-3)"],
];

/** The ramp's colour at a percentage, mixed between the two stops around it. */
function gaugeColour(pct: number): string {
  for (let i = 1; i < GAUGE_STOPS.length; i++) {
    const [p1, c1] = GAUGE_STOPS[i];
    const [p0, c0] = GAUGE_STOPS[i - 1];
    if (pct <= p1) {
      const t = Math.round(((pct - p0) / (p1 - p0)) * 100);
      return `color-mix(in oklab, ${c1} ${t}%, ${c0})`;
    }
  }
  return GAUGE_STOPS[GAUGE_STOPS.length - 1][1];
}

/** The gauge opens at the bottom: from lower left, clockwise, to lower right. */
const GAUGE_START = 135;
const GAUGE_SWEEP = 270;

/**
 * A gauge, drawn rather than described.
 *
 * Its colour follows the percentage along the arc — red at nothing, through
 * orange and yellow, to green — and only the part the score has earned is
 * painted, over a grey track. SVG has no conic gradient, so the painted arc is
 * a run of short segments, each coloured at its own midpoint; every one
 * overlaps the next by half a step, or antialiasing leaves a hairline seam at
 * each join. The two ends are dots in their own colours, because a round cap on
 * a segment would bulge over its neighbour.
 *
 * No text inside the SVG: `getComputedStyle` reports an SVG font size in user
 * units, so a label in here is a size nothing on the page agrees about and the
 * mobile audit measures it after viewBox scaling — which is how one diagram in
 * this project shipped at 5.4px. The figure sits over it in ordinary HTML.
 */
export function Ring({ value, size = 88 }: { value: number; size?: number }) {
  const stroke = size >= 80 ? 7 : 5;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const pct = Math.max(0, Math.min(100, value));

  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  };
  const arc = (from: number, to: number) =>
    `M ${at(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${at(to)}`;

  // Fewer, longer segments on the small row gauges: a 34px ring cannot show
  // more steps than that, and the table draws fifty of them.
  const step = size >= 80 ? 4.5 : 9;
  const end = GAUGE_START + (GAUGE_SWEEP * pct) / 100;
  const segments: { d: string; colour: string }[] = [];
  for (let a0 = GAUGE_START; a0 < end; a0 += step) {
    const a1 = Math.min(a0 + step, end);
    segments.push({
      d: arc(a0, Math.min(a1 + step / 2, end)),
      colour: gaugeColour((((a0 + a1) / 2 - GAUGE_START) / GAUGE_SWEEP) * 100),
    });
  }
  const dot = (deg: number, colour: string) => {
    const [x, y] = at(deg).split(" ");
    return <circle cx={x} cy={y} r={stroke / 2} style={{ fill: colour }} />;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d={arc(GAUGE_START, GAUGE_START + GAUGE_SWEEP)} fill="none" strokeWidth={stroke}
        strokeLinecap="round" className="text-line-strong" stroke="currentColor"
      />
      {segments.map((s, i) => (
        <path key={i} d={s.d} fill="none" strokeWidth={stroke} style={{ stroke: s.colour }} />
      ))}
      {pct > 0 && dot(GAUGE_START, gaugeColour(0))}
      {pct > 0 && dot(end, gaugeColour(pct))}
    </svg>
  );
}

/** The whole-site figure, and the fixes that would move it most. */
export function SiteScoreCard({
  site, withIssues, params,
}: {
  site: SeoMeta["site_score"];
  withIssues: number;
  params: { type?: string; q?: string; per_page?: string };
}) {
  const band = BAND[site.band];

  // Filters compose, so the card carries whatever narrowing is already on.
  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (params.type) q.set("type", params.type);
    if (params.q) q.set("q", params.q);
    if (params.per_page) q.set("per_page", params.per_page);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `/admin/seo?${q.toString()}`;
  };

  return (
    <div className="mb-6 grid gap-4 rounded-lg border border-line-strong bg-card p-5 lg:grid-cols-[auto_1fr]">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Ring value={site.value} />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className={cn("font-display text-[26px] font-semibold leading-none", band.text)}>
              {site.value}
            </span>
          </span>
        </div>

        <div>
          <p className="text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
            Site SEO score
          </p>
          <p className={cn("font-display text-xl font-semibold", band.text)}>{band.label}</p>
          <p className="mt-0.5 text-12-5 text-muted">
            Averaged across {site.records} indexable {site.records === 1 ? "record" : "records"}.
            {" "}
            <Link href={href({ issues: "1" })} className="text-brand-ink underline">
              {withIssues} with issues
            </Link>.
          </p>
          {/*
            The two readiness averages (docs/aeo-geo-contract.md §5), once the
            API sends them; each links to the records it is lowest on. Absent
            until then, never zero.
          */}
          {(site.aeo || site.geo) && (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-12-5 text-muted">
              {site.aeo && (
                <Link href={href({ aeo: "poor" })} className="hover:underline" title="Answer-engine readiness — open the records rated poor">
                  AEO <span className={cn("font-semibold tabular-nums", BAND[site.aeo.band].text)}>{site.aeo.value}</span>
                </Link>
              )}
              {site.geo && (
                <Link href={href({ geo: "poor" })} className="hover:underline" title="Generative-engine readiness — open the records rated poor">
                  GEO <span className={cn("font-semibold tabular-nums", BAND[site.geo.band].text)}>{site.geo.value}</span>
                </Link>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="min-w-0 lg:border-l lg:border-line lg:pl-6">
        <p className="text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
          Biggest wins
        </p>

        {site.top_issues.length === 0 ? (
          <p className="mt-1.5 text-13 text-muted">
            Every check passes on every record. Nothing here needs attention.
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-12-5 text-muted">
              Ranked by what each is costing — how many records fail it, weighted by what
              the check is worth. Open one to see only those records.
            </p>
            <Wins issues={site.top_issues} href={(key) => href({ check: key })} />
          </>
        )}

        {/*
          The same list for each readiness score (2026-09-21): what would
          move the AEO and GEO averages most, each chip opening the records
          failing that one check through the score's own parameter. Drawn
          only where the API sends them, and only while something fails —
          a heading over "everything passes" three times is noise.
        */}
        {([["AEO", "aeo", site.aeo], ["GEO", "geo", site.geo]] as const).map(([label, key, score]) => (
          score && score.top_issues.length > 0 && (
            <div key={key} className="mt-3.5">
              <p className="text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                {label} — biggest wins
                <span className={cn("ml-2 font-display text-12 normal-case tracking-normal tabular-nums", BAND[score.band].text)}>{score.value}</span>
              </p>
              <Wins issues={score.top_issues} href={(k) => href({ [`${key}_check`]: k })} />
            </div>
          )
        ))}

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {(["good", "fair", "poor"] as const).map((b) => (
            <span
              key={b}
              className={cn(
                "rounded px-2 py-1 text-12 font-medium",
                BAND[b].soft, BAND[b].text,
              )}
            >
              {site.distribution[b]} {BAND[b].label.toLowerCase()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The chips: one check failing across the site, its count, and the filtered list behind it. */
function Wins({ issues, href }: { issues: SeoTopIssue[]; href: (key: string) => string }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {issues.map((issue) => (
        <Link
          key={issue.key}
          href={href(issue.key)}
          className="flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 py-1.5 pl-3 pr-1.5 text-12-5 font-medium text-ink transition-colors hover:border-brand-600 hover:text-brand-ink"
        >
          {issue.label}
          <span className="rounded-full bg-card px-1.5 py-px text-11-5 font-semibold text-muted">
            {issue.count}
          </span>
        </Link>
      ))}
    </div>
  );
}
