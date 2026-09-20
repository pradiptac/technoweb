/**
 * One way to write a date, so the console and the site agree.
 *
 * Nine files defined their own `formatDate`, and the ad-hoc calls beside
 * them split 19 to 16 between `en-GB` and `en-IN` — same shape, two
 * spellings, and a time that read "14:05" on one screen and "2:05 pm" on
 * the next. `en-IN`, because the business and its customers are Indian and
 * that is the locale the numbers already use (`toLocaleString("en-IN")`
 * for every count in the console).
 */
export const LOCALE = "en-IN";

const STYLES = {
  /** 14 Sept 2026 */
  short: { day: "numeric", month: "short", year: "numeric" },
  /** 14 September 2026 */
  long: { day: "numeric", month: "long", year: "numeric" },
  /** Sept 2026 — a certificate's validity, a month of archive. */
  monthYear: { month: "short", year: "numeric" },
  /** 14 Sept 2026, 10:15 am */
  dateTime: { dateStyle: "medium", timeStyle: "short" },
  /** 14/9/2026 — the compact numeric form for a column of hits. */
  numeric: {},
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof STYLES;

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // A bare `YYYY-MM-DD` is parsed as UTC midnight by `new Date`, which is the
  // previous evening anywhere east of Greenwich — so a date with no time is
  // read as local midnight.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
}

/**
 * `iso` may be a full timestamp, a bare date, or nothing; nothing and an
 * unparseable value render as `empty`, a dash by default.
 */
export function formatDate(iso: string | Date | null | undefined, style: DateStyle = "short", empty = "—"): string {
  if (!iso) return empty;
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return empty;
  return new Intl.DateTimeFormat(LOCALE, STYLES[style]).format(d);
}

/**
 * The compact form for a table: no year while it is the current one — in a
 * list it nearly always is, and the four extra characters wrap the column —
 * and the full date otherwise. Put the full date in the cell's `title`.
 */
export function formatTableDate(iso: string | Date | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return empty;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(LOCALE, sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** "Just now", "3h ago", "2d ago", then the date — for a queue that is worked by recency. */
export function relativeTime(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return empty;
  const hours = (Date.now() - d.getTime()) / 36e5;
  if (hours < 1) return "Just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  if (hours < 24 * 7) return `${Math.floor(hours / 24)}d ago`;
  return formatDate(d, "short");
}
