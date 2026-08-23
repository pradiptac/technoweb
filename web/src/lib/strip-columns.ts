/**
 * Column classes for a metric strip, derived from how many metrics it holds.
 *
 * These strips draw their hairlines with `gap-px` over a tinted container, so
 * any grid track without an item in it is not whitespace — it is a filled
 * panel the same colour as the rules. A case study with two results in a
 * four-column grid rendered half the strip as one blank tinted block.
 *
 * The counts are not all editable in the same place, which is why this is
 * shared: a case study's `results` come from the CMS, and the homepage stats
 * are lines in a settings field. Both can be any length, and neither author
 * is thinking about grid tracks.
 *
 * A lookup rather than a template, because Tailwind only emits classes it can
 * see written out. `mobile` is the column count below `sm`, where a big
 * figure and its label need the width more than the row needs to be short.
 */
const COLUMNS: Record<string, string> = {
  // mobile: 1 — one metric per row on a phone
  "1:1": "",
  "1:2": "sm:grid-cols-2",
  "1:3": "sm:grid-cols-3",
  "1:4": "sm:grid-cols-2 lg:grid-cols-4",
  "1:5": "lg:grid-cols-5",
  "1:6": "sm:grid-cols-3 lg:grid-cols-6",
  // mobile: 2 — for compact strips whose figures are small enough to pair up
  "2:1": "",
  "2:2": "grid-cols-2",
  "2:3": "grid-cols-3",
  "2:4": "grid-cols-2 sm:grid-cols-4",
  "2:5": "grid-cols-1 sm:grid-cols-5",
  "2:6": "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

export function stripColumns(count: number, mobile: 1 | 2 = 1): string {
  // Above six, fall back to the four-across pattern. A last row that does not
  // divide evenly will still show blank tracks, but nothing in this product
  // publishes seven metrics in one strip.
  return COLUMNS[`${mobile}:${count}`] ?? COLUMNS[`${mobile}:4`];
}
