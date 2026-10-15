# The chart kit

`web/src/components/charts/` (0.100.0, 2026-10-05). The console's dashboards
were hand-rolled divs with `title=` tooltips; this is one small in-house kit
they all draw with. No third-party chart library — the bundle stays lean and
the existing approach was already proven on the ticket volume curve.

| Component | Kind | Use |
|---|---|---|
| `AreaChart` | client island | smooth multi-series lines with fills; pointer and keyboard read-out, legend toggles, compare-to-previous (dashed), Table view, CSV; `format="paise"` for money |
| `BarList` | server | ranked horizontal bars with count and share; rows can link to the filtered list |
| `Donut` | server | shares with the total in the middle and a full legend |
| `Funnel` | server | stages that only narrow, each step's conversion between them |
| `Heatmap` | server | rows × columns of counts shaded against the busiest cell (weekday × hour) |
| `Sparkline` | server | a shape in a tile; `StatTile` takes `spark` and `delta` |
| `geometry.ts`, `tones.ts`, `csv.ts` | pure | `niceMax`, `smoothPath`, `percentChange`; `CHART_TONES`; `toCsv`/`downloadCsv` |

Probe: `web/scripts/probes/charts.mjs`.

## Rules

**Marks are SVG, every word is HTML.** Plots are a 0..100 box stretched with
`preserveAspectRatio="none"` and `vector-effect="non-scaling-stroke"`; axis
labels, ticks, the read-out and the dots on it are HTML, because SVG text
scales with the viewBox and lands under the 12px floor, and a circle in a
stretched viewBox is an ellipse.

**Colours are tokens by meaning** (`CHART_TONES`: the status tokens, the
brand ramps, the twelve tag hues for names). A series and the badge for the
same word are one colour; a tone reaches a gradient stop as `var(--color-*)`.
Charts are graphics behind no text (3:1), and a delta's arrow is coloured
while its words stay `ink-2` — the tile's tinted ground was never measured
against green text.

**Nothing measures on render.** The read-out is clamped inside the plot from
a width read in the event handler; the server render is the complete chart.
The keyboard: the plot is one tab stop, arrows move a point, Home/End jump,
Escape closes, and a polite live region says the point in words.

**Arrival is CSS, once, inside the reduced-motion guard**: `[data-chart-draw]`
wipes a line in over `--duration-draw`, `[data-chart-grow]` grows a bar,
`[data-chart-sweep]`/`[data-chart-cell]` fade. `from`-only keyframes on
`clip-path`, `transform`, `opacity` — never a colour the audit reads, never
wider than the document.

**Honest numbers.** An axis top is `niceMax` (even, 1-2-2.5-5 steps, never
below 2). A percentage change needs a previous figure of five or more
(`percentChange`). A funnel is fed what happened to a cohort, never a status
snapshot. An empty chart says what was measured.

**Phone widths.** A legend beside a donut wraps under it below 12rem; heatmap
cells are 14px tall with 2px gaps below `sm`; tick labels are positioned, not
laid out as flex columns. `audit:mobile` covers `/admin`, `/admin/store`,
`/admin/chat`, `/admin/leads`.

## The dashboard's series (API)

`GET /admin/dashboard` adds `metrics.volume_series.previous` (the same number
of buckets immediately before, aligned by position), `metrics.arrivals`
(weekday × hour over 90 days, every cell present), and on `leads`
`series` (30 days of new leads) and `funnel` (`received`/`contacted`/`won` of
the last 90 days' leads, spam out). `DashboardChartsTest` pins each.

## Skeletons

`components/admin/skeletons.tsx`: `DashboardSkeleton`, `FormSkeleton`,
`DetailSkeleton` — the outline of each kind of screen, used by the
dashboard's `<Suspense>` and by a `loading.tsx` in every console `[id]`,
`new` and record route (91 of them). The root `admin/(app)/loading.tsx`
keeps the table shape for list screens.
