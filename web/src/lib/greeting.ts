/**
 * "Good evening, Priya" — the hour in IST, worked out where it is rendered
 * (the server), so the greeting hydrates exactly as it was drawn. A blank
 * name gives the greeting alone.
 */
export function greeting(name: string, now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = name.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
