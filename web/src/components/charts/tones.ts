/**
 * A chart's colours, by meaning — the same tokens `TONE_BAR` and
 * `TONE_STROKE` paint a badge with, so a series and the badge for the same
 * word are one colour by construction.
 *
 * Each is a `var(--color-*)` rather than a utility class, because a series
 * colour has to reach an SVG gradient stop, an inline swatch and a tooltip
 * dot alike, and a stop cannot take a class. Every one inverts with the
 * scheme. These are graphical objects behind no text — WCAG 1.4.11's 3:1, not
 * 4.5:1 — and every word on a chart is HTML in `ink`/`muted` on the card.
 *
 * `tag1`…`tag12` are the blog categories' twelve hues, for a series that is
 * a name rather than a state (a lead source, a category): already contrast-
 * checked on the card in both schemes.
 */
export const CHART_TONES = {
  info: "var(--color-info)",
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
  brand: "var(--color-brand-500)",
  accent: "var(--color-accent-500)",
  secondary: "var(--color-secondary-500)",
  muted: "var(--color-muted)",
  tag1: "var(--color-tag-1)",
  tag2: "var(--color-tag-2)",
  tag3: "var(--color-tag-3)",
  tag4: "var(--color-tag-4)",
  tag5: "var(--color-tag-5)",
  tag6: "var(--color-tag-6)",
  tag7: "var(--color-tag-7)",
  tag8: "var(--color-tag-8)",
  tag9: "var(--color-tag-9)",
  tag10: "var(--color-tag-10)",
  tag11: "var(--color-tag-11)",
  tag12: "var(--color-tag-12)",
} as const;

export type ChartTone = keyof typeof CHART_TONES;

/** The `n`th categorical hue, cycling — for a list of names with no meaning to colour by. */
export function categoricalTone(n: number): ChartTone {
  return `tag${(n % 12) + 1}` as ChartTone;
}

/** A tone or a raw `var(--…)`/colour string, as CSS. */
export function toneColour(tone: ChartTone | string): string {
  return tone in CHART_TONES ? CHART_TONES[tone as ChartTone] : tone;
}
