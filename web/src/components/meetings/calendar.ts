/**
 * Calendar arithmetic for the booking page, on `Y-m-d` strings.
 *
 * Every date here is a *label* the API wrote in its own timezone — a day in
 * the booking window, not an instant — so the arithmetic runs in UTC, where
 * a day is always 24 hours and nothing shifts with the visitor's zone or the
 * server's. The names are fixed English arrays rather than `Intl`, so the
 * server's render and the browser's agree to the byte (the hydration rule
 * `lib/dates.ts` exists for). No directive: the day picker, the slot picker
 * and the manage panel all import it.
 */

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function utc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function ymdOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const d = utc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return ymdOf(d);
}

/** `2026-10` for any day in October 2026. */
export function monthOf(ymd: string): string {
  return ymd.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return ymdOf(d).slice(0, 7);
}

export function firstOfMonth(month: string): string {
  return `${month}-01`;
}

export function lastOfMonth(month: string): string {
  return addDays(firstOfMonth(addMonths(month, 1)), -1);
}

/** 0 for Monday … 6 for Sunday — the grid starts its weeks on a Monday. */
export function weekdayIndex(ymd: string): number {
  return (utc(ymd).getUTCDay() + 6) % 7;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Tuesday 6 October 2026" — for a screen reader's reading of a day cell. */
export function longDayLabel(ymd: string): string {
  const d = utc(ymd);
  return `${WEEKDAYS[weekdayIndex(ymd)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The weeks of a month as rows of seven `Y-m-d` strings, padded with the neighbouring months' days. */
export function monthGrid(month: string): string[][] {
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);
  let day = addDays(first, -weekdayIndex(first));
  const rows: string[][] = [];

  while (day <= last) {
    const row: string[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(day);
      day = addDays(day, 1);
    }
    rows.push(row);
  }

  return rows;
}

export function clampDate(ymd: string, min: string, max: string): string {
  return ymd < min ? min : ymd > max ? max : ymd;
}
