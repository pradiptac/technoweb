/**
 * Dates for engineer visits, pinned to India Standard Time.
 *
 * The API reads and writes a visit's times in `Asia/Kolkata` — a
 * `datetime-local` input posts a wall-clock time with no offset and Laravel
 * reads it in the app's timezone — so everything here formats in IST
 * whatever zone the Node process or the browser happens to be in. Pure
 * functions, no `server-only`: the booking form, the console's confirm form
 * and the server pages all read them.
 */
export const VISIT_TZ = "Asia/Kolkata";

/** `YYYY-MM-DD` for a moment, in IST. */
export function istDate(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is the one shape every input and the API agree on.
  return new Intl.DateTimeFormat("en-CA", { timeZone: VISIT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** `YYYY-MM-DDTHH:MM` for an ISO timestamp, in IST — a `datetime-local` value. */
export function istDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: VISIT_TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** "Tue 6 Oct" for a bare `YYYY-MM-DD`, read as a calendar date rather than a moment. */
export function visitDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

/** ISO weekday (1 = Monday) of a bare `YYYY-MM-DD`. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
  return day === 0 ? 7 : day;
}
