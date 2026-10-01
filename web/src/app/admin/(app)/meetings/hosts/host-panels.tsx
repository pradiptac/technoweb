"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { SaveStatus } from "@/components/admin/form-actions";
import { IconTrash } from "@/components/icons-ui";
import { useSaveStatus } from "@/lib/hooks/use-save-status";
import { addTimeOffAction, deleteTimeOffAction, saveHostHoursAction, type MeetingActionState, type MeetingResult } from "../actions";
import type { MeetingHost, MeetingHostHours } from "@/types/meetings";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Row = { id: number; start: string; end: string };

/**
 * The hours as one list per weekday (ISO 1–7), each interval keyed for React.
 * The ids are positional, so the server and the browser agree on them — they
 * are also the inputs' `id`s — and rows added later count on from 1000.
 */
function byDay(hours: MeetingHostHours[]): Record<number, Row[]> {
  const days: Record<number, Row[]> = {};
  for (let d = 1; d <= 7; d++) days[d] = [];
  hours.forEach((h, i) => {
    if (h.weekday >= 1 && h.weekday <= 7) days[h.weekday].push({ id: i + 1, start: h.start.slice(0, 5), end: h.end.slice(0, 5) });
  });
  for (const d of Object.keys(days)) days[Number(d)].sort((a, b) => a.start.localeCompare(b.start));
  return days;
}

/**
 * A host's weekly hours: a row per weekday, each with any number of
 * intervals. A host with none of their own works the defaults (Meetings →
 * Settings); the editor opens on those so changing one day does not mean
 * typing out the other four. Saved as a whole — the API replaces the lot —
 * and "Use the default hours" saves an empty list.
 */
export function HostHoursEditor({ host, defaults }: { host: MeetingHost; defaults: MeetingHostHours[] }) {
  const [days, setDays] = useState(() => byDay(host.uses_default_hours ? defaults : host.hours));
  const [usesDefault, setUsesDefault] = useState(host.uses_default_hours);
  const { dirty, saving, message, touch, run, setDirty } = useSaveStatus();
  const nextId = useRef(1000);

  const edit = (weekday: number, rows: Row[]) => {
    setDays((d) => ({ ...d, [weekday]: rows }));
    touch();
  };

  const flatten = (): MeetingHostHours[] =>
    Object.entries(days).flatMap(([weekday, rows]) => rows.map((r) => ({ weekday: Number(weekday), start: r.start, end: r.end })));

  const save = () => run(async () => {
    const res = await saveHostHoursAction(host.id, flatten());
    if (!res.error) setUsesDefault(false);
    return res;
  }, "Hours saved.");

  const resetToDefault = () => run(async () => {
    const res = await saveHostHoursAction(host.id, []);
    if (!res.error) {
      setDays(byDay(defaults));
      setUsesDefault(true);
      setDirty(false);
    }
    return res;
  }, "Back on the default hours.");

  return (
    <div>
      <p className="mb-3 text-12-5 text-muted">
        {usesDefault && !dirty
          ? "Works the default hours from Meetings → Settings. Change a day and save to give them hours of their own."
          : "Their own hours. A day with no interval is a day off."}
      </p>

      <ul className="grid gap-2">
        {WEEKDAYS.map((name, i) => {
          const weekday = i + 1;
          const rows = days[weekday] ?? [];

          return (
            <li key={weekday} className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-line pb-2 last:border-b-0">
              <span className="w-[92px] shrink-0 pt-2 text-13 font-semibold">{name}</span>
              <div className="grid min-w-0 flex-1 gap-2">
                {rows.length === 0 && <span className="pt-2 text-12-5 text-muted">Not working</span>}
                {rows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`h${host.id}-${row.id}-start`}>{name} from</label>
                    <Input
                      id={`h${host.id}-${row.id}-start`} type="time" step={900} value={row.start} className="w-[124px]"
                      onChange={(e) => edit(weekday, rows.map((r) => (r.id === row.id ? { ...r, start: e.currentTarget.value } : r)))}
                    />
                    <span className="text-12-5 text-muted">to</span>
                    <label className="sr-only" htmlFor={`h${host.id}-${row.id}-end`}>{name} until</label>
                    <Input
                      id={`h${host.id}-${row.id}-end`} type="time" step={900} value={row.end} className="w-[124px]"
                      onChange={(e) => edit(weekday, rows.map((r) => (r.id === row.id ? { ...r, end: e.currentTarget.value } : r)))}
                    />
                    <button
                      type="button"
                      onClick={() => edit(weekday, rows.filter((r) => r.id !== row.id))}
                      aria-label={`Remove ${name} ${row.start} to ${row.end}`}
                      className="grid size-9 place-items-center rounded text-muted hover:bg-surface-2 hover:text-err"
                    >
                      <IconTrash className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const last = rows[rows.length - 1];
                  edit(weekday, [...rows, { id: nextId.current++, start: last ? last.end : "10:00", end: "18:00" }]);
                }}
                className="min-h-9 rounded px-2 text-12-5 font-semibold text-brand-ink hover:bg-surface-2"
              >
                + Add hours
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} pending={saving} disabled={saving}>
          {saving ? "Saving…" : "Save hours"}
        </Button>
        {!usesDefault && (
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={resetToDefault}>Use the default hours</Button>
        )}
        <SaveStatus dirty={dirty} message={message} />
      </div>
    </div>
  );
}

const initial: MeetingActionState = {};

/**
 * Time off: a list with Remove, and a form to add one. The two times are
 * `datetime-local` values, a wall clock the API reads in the app's
 * timezone — the visit confirm form's arrangement.
 */
export function HostTimeOff({ host }: { host: MeetingHost }) {
  const action = addTimeOffAction.bind(null, host.id);
  const [state, formAction, pending] = useActionState(action, initial);
  const [busy, start] = useTransition();
  const [removed, setRemoved] = useState<MeetingResult>({});
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <div>
      {removed.error && <Alert tone="err" title="Not removed">{removed.error}</Alert>}

      {host.time_off.length === 0 ? (
        <p className="mb-3 text-12-5 text-muted">None booked.</p>
      ) : (
        <ul className="mb-3 grid gap-1.5">
          {host.time_off.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 rounded border border-line-strong bg-surface-2 px-3 py-1.5 text-13">
              <span className="min-w-0 flex-1">
                {t.label}
                {t.note && <span className="block truncate text-12 text-muted">{t.note}</span>}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => start(async () => setRemoved(await deleteTimeOffAction(host.id, t.id)))}
                className="min-h-9 rounded px-2 text-12-5 font-semibold text-err hover:bg-err-soft"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <Form action={formAction} state={state} className="rounded border border-line-strong p-3">
        {state.error && <Alert tone="err" title="Could not add it">{state.error}</Alert>}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="From" htmlFor={`off-${host.id}-from`} variant="float-static" error={err("starts_at")}>
            <Input id={`off-${host.id}-from`} name="starts_at" type="datetime-local" step={900} required />
          </Field>
          <Field label="Until" htmlFor={`off-${host.id}-to`} variant="float-static" error={err("ends_at")}>
            <Input id={`off-${host.id}-to`} name="ends_at" type="datetime-local" step={900} required />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor={`off-${host.id}-note`} error={err("note")}>
          <Input id={`off-${host.id}-note`} name="note" maxLength={200} />
        </Field>
        <Button type="submit" size="sm" variant="secondary" pending={pending}>{pending ? "Adding…" : "Add time off"}</Button>
      </Form>
    </div>
  );
}
