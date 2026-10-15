/**
 * The arithmetic every chart in the kit shares — no JSX, no DOM, so a server
 * component and a client island can both import it without dragging the
 * other's boundary along (the `lib/site-settings.ts` rule).
 *
 * Every plot here is drawn in a 0..100 box in both axes and stretched with
 * `preserveAspectRatio="none"`, the shape the ticket volume chart proved:
 * the numbers only have to be convenient, and the strokes stay crisp through
 * `vector-effect="non-scaling-stroke"`. Labels are never SVG `<text>` — a
 * label in a viewBox scales with the box and lands under the 12px floor.
 */

/**
 * The top of an axis: the peak rounded up to a figure a gridline can name.
 *
 * Even, so the midline is a whole number — a gridline reading "3.5 tickets"
 * describes something that cannot happen — and from there 1-2-5 steps, so a
 * peak of 137 gets an axis of 150 rather than 138. Never below 2: an axis
 * whose top is the single value drawn makes one ticket look like a flood.
 */
export function niceMax(peak: number): number {
  if (peak <= 2) return 2;
  if (peak <= 10) return Math.ceil(peak / 2) * 2;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const top = step * magnitude;
    if (top >= peak) return top % 2 === 0 ? top : top * 2;
  }
  return Math.ceil(peak);
}

/**
 * A smooth line through every point, which never leaves the box.
 *
 * Catmull-Rom converted to cubic Béziers at the standard sixth-of-the-span
 * tension, with the control points clamped into 0..100 — measured on the
 * ticket dashboard, a drop from a busy day into two quiet ones put a control
 * point at y=108, and a curve bowing under the baseline is drawing fewer than
 * none. The line still passes through every measured point.
 */
export function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]} L 100 ${pts[0][1]}`;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  let path = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6);
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return path;
}

/** The points of a series in the 0..100 box, against an axis top. */
export function plot(values: readonly number[], top: number): [number, number][] {
  const last = Math.max(1, values.length - 1);
  return values.map((v, i) => [(i / last) * 100, 100 - Math.min(100, (Math.max(0, v) / top) * 100)]);
}

/** A line's path closed down to the baseline, for the fill under it. */
export function under(path: string): string {
  return path ? `${path} L 100 100 L 0 100 Z` : "";
}

/**
 * A change between two figures, or null when it would mislead.
 *
 * Null when the earlier figure is under `floor`: one ticket last month
 * against six this month is a true +500% and a useless thing to publish.
 * The dashboard's tile has carried this rule since it shipped; it lives
 * here now so every tile with a delta follows it.
 */
export function percentChange(current: number, previous: number, floor = 5): number | null {
  if (previous < floor) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "1,204" in the console's locale; grouping is the only formatting a count wants. */
export function count(n: number): string {
  return n.toLocaleString("en-IN");
}
