"use client";

import { useRef, useState } from "react";
import { Field, Input } from "@/components/ui/input";
import { isoWeekday, visitDayLabel } from "@/lib/visit-dates";
import type { VisitWindow } from "@/types/api";

type Rules = {
  windows: VisitWindow[];
  days: number[];
  min_date: string;
  max_date: string;
  holidays: string[];
  max_preferred: number;
};

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Up to three preferred times: a date and a part of the day each.
 *
 * The inputs are named `preferred.{i}.date` and `preferred.{i}.window`, which
 * is how the API names its errors, so a refusal lands under the row it is
 * about. Rows carry an id of their own and are keyed by it: removing the
 * middle one re-numbers the names while the values stay with the row that
 * holds them, which an index key would get backwards.
 *
 * The date input's `min` and `max` stop the obvious; a Sunday or a holiday
 * gets through any date picker, so a row says so as soon as one is chosen —
 * a hint rather than a refusal, because the API has the last word and
 * checks again anyway.
 *
 * The part of the day is a segmented radio rather than a select: three
 * choices a person compares side by side, each with its hours printed.
 */
export function PreferredTimesField({
  rules,
  initial = [],
  err,
}: {
  rules: Rules;
  initial?: { date: string; window: string }[];
  err: (field: string) => string | undefined;
}) {
  const nextId = useRef(initial.length || 1);
  const [rows, setRows] = useState<number[]>(() => (initial.length ? initial.map((_, i) => i) : [0]));
  const [hints, setHints] = useState<Record<number, string>>({});

  const add = () => {
    if (rows.length >= rules.max_preferred) return;
    const id = nextId.current++;
    setRows((r) => [...r, id]);
  };

  const remove = (id: number) => setRows((r) => (r.length > 1 ? r.filter((x) => x !== id) : r));

  const check = (id: number, date: string) => {
    let hint = "";
    if (date && !rules.days.includes(isoWeekday(date))) hint = `We do not visit on a ${DAY_NAMES[isoWeekday(date)]}.`;
    else if (date && rules.holidays.includes(date)) hint = `We are closed on ${visitDayLabel(date)}.`;
    setHints((h) => ({ ...h, [id]: hint }));
  };

  const offered = rules.days.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");

  return (
    <fieldset className="mb-5 grid min-w-0 gap-4">
      <legend className="mb-1 text-15 font-semibold">When would suit you?</legend>
      <p className="-mt-2 text-13 text-muted">
        Up to {rules.max_preferred} choices, best first. Engineers visit {offered}. We confirm the actual time by email.
      </p>

      {err("preferred") && <p className="text-13 text-err" role="alert">{err("preferred")}</p>}

      <ol className="grid min-w-0 gap-4">
        {rows.map((id, i) => {
          const start = initial[id];
          const dateError = err(`preferred.${i}.date`);
          const windowError = err(`preferred.${i}.window`);

          return (
            <li key={id} className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-13 font-semibold">Choice {i + 1}</span>
                {rows.length > 1 && (
                  <button type="button" onClick={() => remove(id)}
                    className="min-h-6 rounded px-2 text-13 font-semibold text-brand-ink underline hover:no-underline">
                    Remove<span className="sr-only"> choice {i + 1}</span>
                  </button>
                )}
              </div>

              <Field label="Date" htmlFor={`preferred-${id}-date`} variant="float-static"
                error={dateError} hint={!dateError ? hints[id] || undefined : undefined}>
                <Input id={`preferred-${id}-date`} name={`preferred.${i}.date`} type="date" required
                  min={rules.min_date} max={rules.max_date} defaultValue={start?.date ?? ""}
                  onChange={(e) => check(id, e.currentTarget.value)}
                  aria-invalid={Boolean(dateError)} />
              </Field>

              <div role="radiogroup" aria-labelledby={`preferred-${id}-window-label`} className="min-w-0">
                <p id={`preferred-${id}-window-label`} className="mb-1.5 text-13 font-semibold">Part of the day</p>
                <div className="flex flex-wrap gap-2">
                  {rules.windows.map((w) => (
                    <label key={w.value} className="relative">
                      <input type="radio" name={`preferred.${i}.window`} value={w.value} required
                        defaultChecked={start ? start.window === w.value : false}
                        className="peer absolute inset-0 size-full cursor-pointer opacity-0" />
                      <span className="inline-flex min-h-11 flex-col justify-center rounded-md border border-line-strong bg-card px-3 py-1.5 text-14 font-semibold transition-colors duration-(--duration-fast) peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-brand-on peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600">
                        {w.label}
                        <span className="text-12 font-normal">{w.start}–{w.end}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {windowError && <p className="mt-1.5 text-13 text-err">{windowError}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {rows.length < rules.max_preferred && (
        <div>
          <button type="button" onClick={add}
            className="min-h-10 rounded-md border border-dashed border-line-strong px-3 text-14 font-semibold text-brand-ink hover:border-brand-600">
            + Add another time
          </button>
        </div>
      )}
    </fieldset>
  );
}
