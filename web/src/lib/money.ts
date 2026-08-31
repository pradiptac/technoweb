/**
 * Money, in paise, as integers — and the two conversions around the edges.
 *
 * The API stores and sends paise, always. A price is an exact number of the
 * smallest unit there is, and the one thing that must never happen is a total
 * of ₹11,799.999999 — which is what a float gets you the first time somebody
 * multiplies a rupee figure by 100.
 *
 * So `rupeesToPaise` parses the **text** rather than the number: it splits on
 * the decimal point and pads, so "11800.10" becomes 1180010 without ever
 * being a float. `parseFloat("11800.10") * 100` is 1180009.9999999999 in this
 * runtime, and `Math.round` hides that exactly until the day it does not.
 *
 * Pure functions only, so this file is importable from a client component —
 * the rule `lib/site-settings.ts` follows for `telHref`.
 */

/** ₹11,800 — Indian digit grouping, from the browser's own locale data. */
export function formatPaise(paise: number, options: { withPaise?: boolean } = {}): string {
  const showPaise = options.withPaise ?? paise % 100 !== 0;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(paise / 100);
}

/** The value for a rupee input: "11800" or "11800.10", never "11800.00". */
export function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";

  const rupees = Math.trunc(paise / 100);
  const remainder = paise % 100;

  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, "0")}`;
}

/**
 * "11,800.10" → 1180010, by text rather than by arithmetic.
 *
 * Returns null for blank, which is how a nullable price stays nullable, and
 * for anything that is not a plain amount — a form that quietly reads "eleven
 * thousand" as zero would put a free product on the site.
 */
export function rupeesToPaise(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;

  // Commas are what people type and paste; a leading ₹ is what they paste.
  const cleaned = String(input).trim().replace(/[,\s₹]/g, "");

  if (cleaned === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;

  const [whole, fraction = ""] = cleaned.split(".");

  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
