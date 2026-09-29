"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconChevronDown } from "@/components/icons-ui";
import { cn } from "@/lib/utils";
import {
  WEEKDAYS, addDays, addMonths, clampDate, longDayLabel, monthGrid, monthLabel, monthOf, weekdayIndex,
} from "./calendar";

/**
 * A month of days to choose a meeting on (docs/meetings.md).
 *
 * A real `<table>` of real buttons, so it is a calendar to a screen reader
 * without an ARIA grid being reinvented: the caption names the month, each
 * button names its day and how many times are free on it, and the chosen day
 * is `aria-pressed`. On top of that the keyboard moves the way every date
 * picker does — one roving tab stop, the arrows by a day or a week, Home and
 * End to the ends of the week, Page Up and Page Down by a month — and an
 * arrow off the edge of the month turns the page.
 *
 * A day with nothing free stays focusable and says so (`aria-disabled`,
 * "no times free"): skipping it would make the arrows jump unpredictably and
 * hide *why* a date cannot be chosen. It simply does nothing when pressed.
 * Days of the neighbouring months are empty cells, and the month buttons stop
 * at the booking window's ends.
 *
 * `counts` is null while the month's numbers are on their way; every day is
 * then unavailable rather than guessed at.
 */
export function DayPicker({
  month,
  onMonthChange,
  minDate,
  maxDate,
  counts,
  holidays,
  selected,
  onSelect,
  loading = false,
  failed = false,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  minDate: string;
  maxDate: string;
  counts: Record<string, number> | null;
  holidays: string[];
  selected: string | null;
  onSelect: (date: string) => void;
  loading?: boolean;
  failed?: boolean;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  /** A day the keyboard just moved to, focused once the month it is in has rendered. */
  const pendingFocus = useRef<string | null>(null);

  const rows = monthGrid(month);
  const inMonth = (d: string) => monthOf(d) === month;
  const inWindow = (d: string) => d >= minDate && d <= maxDate;
  const countOf = (d: string) => (counts ? counts[d] ?? 0 : 0);
  const available = (d: string) => inWindow(d) && !holidays.includes(d) && countOf(d) > 0;

  const monthDays = rows.flat().filter(inMonth);
  const tabStop =
    (focused && inMonth(focused) && inWindow(focused) ? focused : null)
    ?? (selected && inMonth(selected) ? selected : null)
    ?? monthDays.find(available)
    ?? monthDays.find(inWindow)
    ?? monthDays[0];

  const firstMonth = monthOf(minDate);
  const lastMonth = monthOf(maxDate);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const button = tableRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${target}"]`);
    if (button) {
      pendingFocus.current = null;
      button.focus();
    }
  });

  function moveTo(next: string) {
    const day = clampDate(next, minDate, maxDate);
    setFocused(day);
    pendingFocus.current = day;
    if (monthOf(day) !== month) onMonthChange(monthOf(day));
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(day, -1),
      ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7),
      ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -weekdayIndex(day)),
      End: () => addDays(day, 6 - weekdayIndex(day)),
      PageUp: () => sameDayIn(day, -1),
      PageDown: () => sameDayIn(day, 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveTo(move());
  }

  function status(d: string): string {
    if (!inWindow(d)) return "outside the booking window";
    if (holidays.includes(d)) return "closed";
    if (!counts) return loading ? "loading" : "not available";
    const n = countOf(d);
    return n === 0 ? "no times free" : n === 1 ? "1 time free" : `${n} times free`;
  }

  const captionId = `day-picker-${month}`;

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          disabled={month <= firstMonth}
          aria-label="Previous month"
          className="grid size-10 shrink-0 place-items-center rounded border border-line-strong bg-card text-ink transition-colors duration-(--duration-base) hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-card"
        >
          <IconChevronDown className="size-4 rotate-90" />
        </button>
        <p id={captionId} className="min-w-0 flex-1 text-center text-15 font-semibold" aria-live="polite">
          {monthLabel(month)}
        </p>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          disabled={month >= lastMonth}
          aria-label="Next month"
          className="grid size-10 shrink-0 place-items-center rounded border border-line-strong bg-card text-ink transition-colors duration-(--duration-base) hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-card"
        >
          <IconChevronDown className="size-4 -rotate-90" />
        </button>
      </div>

      <table ref={tableRef} aria-labelledby={captionId} className="w-full table-fixed border-separate border-spacing-1">
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col" className="pb-1 text-center text-12 font-semibold text-muted">
                <abbr title={w} className="no-underline">{w.slice(0, 2)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((d) => {
                if (!inMonth(d)) return <td key={d} aria-hidden />;
                const open = available(d);
                const chosen = selected === d;
                return (
                  <td key={d} className="p-0">
                    <button
                      type="button"
                      data-date={d}
                      tabIndex={d === tabStop ? 0 : -1}
                      aria-pressed={chosen}
                      aria-disabled={!open || undefined}
                      aria-label={`${longDayLabel(d)}, ${status(d)}`}
                      onClick={() => {
                        setFocused(d);
                        if (open) onSelect(d);
                      }}
                      onKeyDown={(e) => onKeyDown(e, d)}
                      className={cn(
                        "relative grid h-10 w-full min-w-0 place-items-center rounded text-14 tabular-nums transition-colors duration-(--duration-fast)",
                        chosen
                          ? "bg-brand-600 font-semibold text-brand-on"
                          : open
                            ? "border border-brand-ink/30 bg-card font-semibold text-ink hover:border-brand-ink hover:bg-surface-2"
                            : "cursor-default text-faint",
                      )}
                    >
                      {Number(d.slice(8))}
                      {open && !chosen && (
                        <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-brand-ink" />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 min-h-5 text-12-5 text-muted" role="status">
        {failed
          ? "The free days could not be loaded. Try another month, or call us."
          : loading
            ? "Finding free days…"
            : counts && monthDays.every((d) => !available(d))
              ? "Nothing free this month — try the next one."
              : ""}
      </p>
    </div>
  );
}

/** The same day of the month `n` months away, pulled back to that month's last day where it is shorter. */
function sameDayIn(day: string, n: number): string {
  const month = addMonths(monthOf(day), n);
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  const wanted = `${month}-${day.slice(8)}`;
  return wanted > last ? last : wanted;
}
