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

export const BAND: Record<SeoBand, { label: string; text: string; soft: string; ring: string }> = {
  good: { label: "Good", text: "text-ok", soft: "bg-ok-soft", ring: "text-ok" },
  fair: { label: "Fair", text: "text-warn", soft: "bg-warn-soft", ring: "text-warn" },
  poor: { label: "Poor", text: "text-err", soft: "bg-err-soft", ring: "text-err" },
};

/**
 * A ring, drawn rather than described.
 *
 * No text inside the SVG: `getComputedStyle` reports an SVG font size in user
 * units, so a label in here is a size nothing on the page agrees about and the
 * mobile audit measures it after viewBox scaling — which is how one diagram in
 * this project shipped at 5.4px. The figure sits over it in ordinary HTML.
 */
export function Ring({ value, band, size = 88 }: { value: number; band: SeoBand; size?: number }) {
  const stroke = size >= 80 ? 7 : 5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className={cn("shrink-0 -rotate-90", BAND[band].ring)}
    >
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        className="text-line-strong" stroke="currentColor"
      />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        stroke="currentColor" strokeLinecap="round"
        strokeDasharray={`${(circumference * value) / 100} ${circumference}`}
      />
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
          <Ring value={site.value} band={site.band} />
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
