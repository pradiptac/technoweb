"use client";

import { useEffect, useState } from "react";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchMeetingSlotsAction } from "./actions";
import type { AdminMeetingSlot } from "@/types/meetings";

type Result = { key: string; slots: AdminMeetingSlot[]; timezone: string; error?: string };

/**
 * A day and a free time, fetched from the admin slots endpoint.
 *
 * The console books on somebody's behalf, so it may pick any day — the
 * public page's notice and window do not apply here — but it never offers a
 * time a booking made here already holds: the API answers only free times,
 * each with the hosts free for it. The two ticks the parent owns widen the
 * answer to times outside working hours and over a Google busy time, and
 * each such time says so.
 *
 * **Nothing is set from an effect.** The fetch is keyed on everything that
 * shapes the answer; a result or a pick made under a different key is
 * simply not the current one, so changing the type, the host, a tick or the
 * day invalidates both without a line of reset code. After a "just taken"
 * refusal the parent remounts this with the same day, which drops the pick
 * and fetches the day again.
 *
 * The chosen time posts as `start`, exactly as the API wrote it; the day as
 * `date`, so a refusal can reopen on it.
 */
export function SlotPicker({
  type, host, outsideHours, googleBusy, initialDate, minDate, error, exclude,
}: {
  /** The type's slug; nothing is fetched without one. */
  type: string;
  host: number | null;
  outsideHours: boolean;
  googleBusy: boolean;
  initialDate?: string;
  /** The earliest day offered — today in the app's timezone. */
  minDate: string;
  error?: string;
  /** The meeting being moved, whose own time must not count as taken. */
  exclude?: string;
}) {
  const [date, setDate] = useState(initialDate ?? "");
  const [result, setResult] = useState<Result | null>(null);
  const [picked, setPicked] = useState<{ key: string; start: string } | null>(null);

  const key = JSON.stringify([type, date, host, outsideHours, googleBusy]);
  const ready = Boolean(type && /^\d{4}-\d{2}-\d{2}$/.test(date));

  useEffect(() => {
    if (!ready) return;

    let live = true;
    fetchMeetingSlotsAction({ type, date, host, outside_hours: outsideHours, google_busy: googleBusy, exclude }).then((res) => {
      if (!live) return;
      setResult({
        key,
        slots: res.data?.slots ?? [],
        timezone: res.data?.timezone_label ?? "",
        error: res.error,
      });
    });

    return () => { live = false; };
  }, [key, ready, type, date, host, outsideHours, googleBusy, exclude]);

  const current = result?.key === key ? result : null;
  const loading = ready && !current;
  const start = picked?.key === key ? picked.start : "";
  const chosen = current?.slots.find((s) => s.start === start);

  return (
    <fieldset className="mb-[18px] min-w-0">
      <legend className="mb-2 block text-13-5 font-semibold">When</legend>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Day" htmlFor="slot_date" variant="float-static" className="mb-0 w-[190px]">
          <Input
            id="slot_date" name="date" type="date" value={date} min={minDate}
            onChange={(e) => setDate(e.currentTarget.value)}
          />
        </Field>
        {!type && <p className="pb-2 text-12-5 text-muted">Choose the kind of meeting first.</p>}
      </div>

      <input type="hidden" name="start" value={start} />

      {error && <p className="mt-2 text-12-5 text-err" role="alert">{error}</p>}

      <div className="mt-3" aria-live="polite">
        {!ready ? (
          <p className="text-12-5 text-muted">{type ? "Pick a day to see the free times." : ""}</p>
        ) : loading ? (
          <p className="text-12-5 text-muted">Looking for free times…</p>
        ) : current?.error ? (
          <p className="text-12-5 text-err">{current.error}</p>
        ) : current && current.slots.length === 0 ? (
          <p className="text-12-5 text-muted">
            Nobody is free that day{outsideHours || googleBusy ? "" : " within working hours"}. Try another day
            {outsideHours ? "." : ", or tick “outside working hours”."}
          </p>
        ) : current ? (
          <>
            <p className="mb-2 text-12 text-faint">Times in {current.timezone || "the site’s time zone"}.</p>
            <div role="radiogroup" aria-label="Free times" className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
              {current.slots.map((slot) => {
                const on = slot.start === start;
                const flagged = slot.outside_hours || slot.google_busy;

                return (
                  <button
                    key={slot.start}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked({ key, start: slot.start })}
                    title={slot.hosts.map((h) => h.name).join(", ")}
                    className={cn(
                      "min-h-11 rounded border px-2 py-1.5 text-center text-13 font-semibold transition-colors duration-(--duration-fast)",
                      on
                        ? "border-brand-600 bg-brand-600 text-brand-on"
                        : flagged
                          ? "border-warn/40 bg-warn-soft text-warn hover:border-warn"
                          : "border-line-strong bg-card text-ink hover:border-brand-ink",
                    )}
                  >
                    {slot.time_label}
                    <span className={cn("block text-11-5 font-normal", on ? "text-brand-on" : "text-muted")}>
                      {slot.outside_hours ? "Outside hours" : slot.google_busy ? "Google busy" : `${slot.hosts.length} free`}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      {chosen && (
        <p className="mt-2 text-12-5 text-muted">
          {chosen.time_label} – free: {chosen.hosts.map((h) => h.name).join(", ") || "—"}
        </p>
      )}
    </fieldset>
  );
}
