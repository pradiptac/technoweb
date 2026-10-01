"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DayPicker } from "./day-picker";
import { LocalTime, ZoneNote } from "./local-time";
import { firstOfMonth, lastOfMonth, longDayLabel, monthOf } from "./calendar";
import type { MeetingOptions, MeetingSlot, MeetingSlotDate, MeetingSlotRange } from "@/types/meetings";

type Rules = Pick<MeetingOptions, "min_date" | "max_date" | "holidays" | "timezone" | "timezone_label">;

/**
 * A day, then a time — the booking page's step two and the reschedule
 * panel's only step (docs/meetings.md).
 *
 * Both halves ask `/api/meetings/slots`, the Next route that forwards the
 * visitor's address to the API and caches nothing: the month's counts when
 * the page turns, the day's times when a day is chosen. Answers are kept by
 * a key that includes `refresh`, so a caller told "that time was just taken"
 * bumps it and both are asked again — the count that fed the day and the
 * times that offered the slot are both stale by then.
 *
 * Nothing is set synchronously in an effect: an effect only starts a fetch,
 * and the answer lands in state from the promise. "Loading" is derived — an
 * answer not in the map yet — rather than a flag somebody has to clear.
 *
 * Remount it (a `key`) when the meeting type changes: a type is a duration,
 * and every count and time depends on it.
 */
export function SlotPicker({
  type,
  rules,
  value,
  onChange,
  refresh = 0,
}: {
  type: string;
  rules: Rules;
  value: MeetingSlot | null;
  onChange: (slot: MeetingSlot | null) => void;
  refresh?: number;
}) {
  const [month, setMonth] = useState(() => monthOf(rules.min_date));
  const [date, setDate] = useState<string | null>(null);
  const [ranges, setRanges] = useState<Record<string, Record<string, number> | "error">>({});
  const [days, setDays] = useState<Record<string, MeetingSlot[] | "error">>({});
  const asked = useRef(new Set<string>());

  const from = firstOfMonth(month) < rules.min_date ? rules.min_date : firstOfMonth(month);
  const to = lastOfMonth(month) > rules.max_date ? rules.max_date : lastOfMonth(month);
  const rangeKey = `${type}|${from}|${to}|${refresh}`;
  const dayKey = date ? `${type}|${date}|${refresh}` : null;

  useEffect(() => {
    if (asked.current.has(rangeKey) || from > to) return;
    asked.current.add(rangeKey);
    const q = new URLSearchParams({ type, from, to });

    fetch(`/api/meetings/slots?${q}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { data: MeetingSlotRange }) => {
        const counts: Record<string, number> = {};
        for (const d of body.data.days) counts[d.date] = d.count;
        setRanges((prev) => ({ ...prev, [rangeKey]: counts }));
      })
      .catch(() => {
        asked.current.delete(rangeKey);
        setRanges((prev) => ({ ...prev, [rangeKey]: "error" }));
      });
  }, [rangeKey, type, from, to]);

  useEffect(() => {
    if (!dayKey || !date || asked.current.has(dayKey)) return;
    asked.current.add(dayKey);
    const q = new URLSearchParams({ type, date });

    fetch(`/api/meetings/slots?${q}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { data: MeetingSlotDate }) => setDays((prev) => ({ ...prev, [dayKey]: body.data.slots })))
      .catch(() => {
        asked.current.delete(dayKey);
        setDays((prev) => ({ ...prev, [dayKey]: "error" }));
      });
  }, [dayKey, type, date]);

  const range = ranges[rangeKey];
  const slots = dayKey ? days[dayKey] : undefined;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="min-w-0">
        <h3 className="mb-2 text-15 font-semibold">Choose a day</h3>
        <DayPicker
          month={month}
          onMonthChange={setMonth}
          minDate={rules.min_date}
          maxDate={rules.max_date}
          holidays={rules.holidays}
          counts={range && range !== "error" ? range : null}
          loading={range === undefined}
          failed={range === "error"}
          selected={date}
          onSelect={(d) => {
            setDate(d);
            if (value) onChange(null);
          }}
        />
      </div>

      <div className="min-w-0">
        <h3 className="mb-2 text-15 font-semibold">
          {date ? <>Times on {longDayLabel(date)}</> : "Choose a time"}
        </h3>
        {!date ? (
          <p className="text-14 text-muted">Pick a day with a dot under it to see its free times.</p>
        ) : slots === undefined ? (
          <p className="text-14 text-muted" role="status">Finding free times…</p>
        ) : slots === "error" ? (
          <p className="text-14 text-err" role="status">The times could not be loaded. Choose the day again, or call us.</p>
        ) : slots.length === 0 ? (
          <p className="text-14 text-muted" role="status">Nothing is free on this day any more — choose another.</p>
        ) : (
          <>
            <ZoneNote timezone={rules.timezone} label={rules.timezone_label} sample={slots[0].start} />
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3 xl:grid-cols-4" aria-label={`Free times, ${rules.timezone_label}`}>
              {slots.map((slot) => {
                const chosen = value?.start === slot.start;
                return (
                  <li key={slot.start} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => onChange(chosen ? null : slot)}
                      className={cn(
                        "h-10 w-full min-w-0 rounded border text-14 font-semibold tabular-nums transition-colors duration-(--duration-fast)",
                        chosen
                          ? "border-brand-600 bg-brand-600 text-brand-on"
                          : "border-line-strong bg-card text-ink hover:border-brand-ink hover:text-brand-ink",
                      )}
                    >
                      {slot.time_label}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-12-5 text-muted">All times {rules.timezone_label}.</p>
          </>
        )}

        {value && (
          <p className="mt-4 rounded border border-brand-ink/30 bg-card px-3 py-2 text-14" role="status">
            <span className="font-semibold">{date ? longDayLabel(date) : ""}, {value.time_label} {rules.timezone_label}</span>
            <LocalTime start={value.start} timezone={rules.timezone} className="text-muted" />
          </p>
        )}
      </div>
    </div>
  );
}
