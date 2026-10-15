import { cn } from "@/lib/utils";
import type { EventCounts } from "@/lib/admin";

/**
 * How full an event is: confirmed seats against its capacity.
 *
 * **Seats, not registrations** — one registration may hold several, and the
 * capacity is a number of chairs. The figure is the API's `confirmed_seats`
 * and the bar is that over `capacity`; with no capacity there is nothing to
 * be a fraction of, so there is no bar and the line says so rather than
 * drawing an empty track that reads as "nobody has registered".
 *
 * The bar is a graphical object behind no text (3:1 against its own track,
 * the `TONE_BAR` argument), and the numbers beside it are what a screen
 * reader is given, so it is `aria-hidden`. Amber once the event is full:
 * a full event is not a fault, it is the moment the waiting list starts to
 * matter.
 */
export function SeatMeter({
  counts, capacity, className, wide = false,
}: {
  counts: EventCounts;
  capacity: number | null;
  className?: string;
  /** The registrations screen's header, where the bar may take the tile's width. */
  wide?: boolean;
}) {
  const seats = counts.confirmed_seats;
  const full = capacity !== null && seats >= capacity;
  const percent = capacity ? Math.min(100, Math.round((seats / capacity) * 100)) : 0;

  return (
    <span className={cn("block min-w-0", className)}>
      {/* One line in a table cell; free to wrap in a tile, which on a phone is narrower than the sentence. */}
      <span className={cn("block tabular-nums", !wide && "whitespace-nowrap")}>
        <span className="font-semibold text-ink">{seats}</span>
        {capacity !== null ? (
          <span className="text-muted"> / {capacity} {capacity === 1 ? "seat" : "seats"}</span>
        ) : (
          <span className="text-muted"> {seats === 1 ? "seat" : "seats"} · no limit</span>
        )}
      </span>

      {capacity !== null && (
        <span aria-hidden className={cn("mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2", wide ? "w-full" : "w-28 max-w-full")}>
          <span className={cn("block h-full rounded-full", full ? "bg-warn" : "bg-brand-500")} style={{ width: `${percent}%` }} />
        </span>
      )}

      {(full || counts.waitlisted > 0) && (
        <span className="mt-1 block text-12 text-muted">
          {full && <span className="font-semibold text-warn">Full</span>}
          {full && counts.waitlisted > 0 && " · "}
          {counts.waitlisted > 0 && <>{counts.waitlisted} waiting</>}
        </span>
      )}
    </span>
  );
}
