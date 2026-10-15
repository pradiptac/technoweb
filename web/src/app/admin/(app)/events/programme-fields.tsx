"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { MediaBrowser } from "@/components/admin/media-browser";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import type { AdminEventAgendaItem, AdminEventSpeaker } from "@/lib/admin";

/**
 * The programme: what happens when, and who is speaking.
 *
 * Two repeaters in the shape `FieldBuilder` settled (0.117.0), and for the
 * same reasons. Each holds its rows as objects and posts **one hidden JSON
 * input**, so reordering is a state change rather than a renaming of every
 * input after the one that moved. The API replaces each list wholesale and
 * reads an absent key as "leave them alone", so the input is always there —
 * `[]` when the last row has gone.
 *
 * Three things every repeater inside a `<Form>` has to do, and `useJsonRows`
 * does them once for both:
 *
 * - **Tell the form about a structural change.** Add, move and remove fire no
 *   input event, so the leave guard and the draft keeper would never hear of
 *   them; an `input` event is dispatched on the hidden input when what would
 *   be posted changes.
 * - **Read a restored draft back.** `FormDraft` writes the draft into the
 *   hidden input and announces `tw:draft-restored`; the rows are rebuilt from
 *   it. (A draft *can* restore a row here, because the row lives in the JSON
 *   rather than in controls of its own.)
 * - **Re-mount on the form's `reset`.** React resets a form's controls when
 *   its action completes, a refused one included, and a control with no
 *   `name` is not one `<Form>` puts back. The state never changed, so
 *   re-mounting the list redraws every control from it.
 */

type AgendaRow = { key: string; time: string; title: string; note: string };
type SpeakerRow = { key: string; name: string; role: string; photo_path: string | null; photo: string | null };

type RowErrors = Record<string, Record<string, string>>;

/* ------------------------------------------------------------ the agenda */

export function AgendaField({
  defaultValue, max, errors,
}: {
  defaultValue: AdminEventAgendaItem[];
  max: number;
  /** The action's 422 map. `agenda.N.*` keys are drawn on the row that was posted Nth. */
  errors?: Record<string, string[]>;
}) {
  const [rows, setRows] = useState<AgendaRow[]>(() => agendaRows(defaultValue, "a"));
  const sent = rows.filter(agendaFilled);
  const posted = JSON.stringify(sent.map((r): AdminEventAgendaItem => ({
    time: r.time.trim() || null, title: r.title.trim(), note: r.note.trim() || null,
  })));
  const { input, epoch } = useJsonRows(posted, setRows, agendaRowsFromDraft);
  const byRow = usePinnedErrors(errors, "agenda", sent.map((r) => r.key));

  const patch = (key: string, next: Partial<AgendaRow>) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...next } : row)));

  return (
    <fieldset className="mb-8 min-w-0">
      <legend className="mb-1 text-14-5 font-semibold">Agenda</legend>
      <p className="mb-3 text-13 text-muted">
        The running order, as the page will show it. The time is text, so write it the way you would say
        it — &ldquo;3:00 pm&rdquo;, &ldquo;After lunch&rdquo;. Leave the list empty and the page shows no agenda.
      </p>

      <input ref={input} type="hidden" name="agenda" value={posted} />
      {errors?.agenda?.[0] && <p className="mb-3 text-13 text-err">{errors.agenda[0]}</p>}

      {rows.length > 0 && (
        <ol key={epoch} className="mb-3 grid gap-3">
          {rows.map((row, i) => {
            const e = byRow[row.key] ?? {};
            const id = (part: string) => `agenda-${part}-${row.key}`;

            return (
              <li key={row.key} className="min-w-0 rounded-lg border border-line-strong bg-card p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-12 font-semibold uppercase tracking-[.04em] text-muted">Item {i + 1}</span>
                  <ReorderButtons
                    dense className="ml-auto" index={i} count={rows.length} subject={`agenda item ${i + 1}`}
                    onMove={(by) => setRows((r) => moved(r, i, by))}
                    onRemove={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                  />
                </div>

                <div className="grid gap-x-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                  <Field label="Time" htmlFor={id("time")} error={e.time} className="mb-3">
                    <Input id={id("time")} maxLength={40} value={row.time} onChange={(ev) => patch(row.key, { time: ev.target.value })} />
                  </Field>
                  <Field label="What happens" htmlFor={id("title")} error={e.title} className="mb-3">
                    <Input id={id("title")} maxLength={160} value={row.title} onChange={(ev) => patch(row.key, { title: ev.target.value })} />
                  </Field>
                </div>
                <Field label="A line about it" htmlFor={id("note")} error={e.note} className="mb-0">
                  <Textarea id={id("note")} rows={2} maxLength={400} value={row.note} onChange={(ev) => patch(row.key, { note: ev.target.value })} />
                </Field>
                <Leftover errors={e} placed={["time", "title", "note"]} />
              </li>
            );
          })}
        </ol>
      )}

      <Button
        type="button" variant="secondary" size="sm" disabled={rows.length >= max}
        onClick={() => setRows((r) => [...r, { key: unusedKey(r.map((x) => x.key), "new-a"), time: "", title: "", note: "" }])}
      >
        Add an agenda item
      </Button>
      {rows.length >= max && <p className="mt-2 text-12-5 text-muted">An event holds at most {max} agenda items.</p>}
    </fieldset>
  );
}

/* ------------------------------------------------------------ the speakers */

export function SpeakersField({
  defaultValue, max, errors,
}: {
  defaultValue: AdminEventSpeaker[];
  max: number;
  errors?: Record<string, string[]>;
}) {
  const [rows, setRows] = useState<SpeakerRow[]>(() => speakerRows(defaultValue, "s"));
  const sent = rows.filter(speakerFilled);
  const posted = JSON.stringify(sent.map((r) => ({
    name: r.name.trim(), role: r.role.trim() || null, photo_path: r.photo_path,
  })));
  const { input, epoch } = useJsonRows(posted, setRows, speakerRowsFromDraft);
  const byRow = usePinnedErrors(errors, "speakers", sent.map((r) => r.key));

  /** The row the one media dialog is choosing a photo for. One dialog, not one per row. */
  const [pickFor, setPickFor] = useState<string | null>(null);

  const patch = (key: string, next: Partial<SpeakerRow>) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...next } : row)));

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-14-5 font-semibold">Speakers</legend>
      <p className="mb-3 text-13 text-muted">
        Who is presenting, in the order the page lists them. A photo is optional and comes from the media
        library — square works best, since it is drawn in a circle.
      </p>

      <input ref={input} type="hidden" name="speakers" value={posted} />
      {errors?.speakers?.[0] && <p className="mb-3 text-13 text-err">{errors.speakers[0]}</p>}

      {rows.length > 0 && (
        <ol key={epoch} className="mb-3 grid gap-3 lg:grid-cols-2">
          {rows.map((row, i) => {
            const e = byRow[row.key] ?? {};
            const id = (part: string) => `speaker-${part}-${row.key}`;
            const who = row.name.trim() || `speaker ${i + 1}`;

            return (
              <li key={row.key} className="min-w-0 rounded-lg border border-line-strong bg-card p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-12 font-semibold uppercase tracking-[.04em] text-muted">Speaker {i + 1}</span>
                  <ReorderButtons
                    dense className="ml-auto" index={i} count={rows.length} subject={`speaker ${i + 1}`}
                    onMove={(by) => setRows((r) => moved(r, i, by))}
                    onRemove={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                  />
                </div>

                <div className="flex min-w-0 gap-3">
                  <div className="w-16 shrink-0">
                    {row.photo ? (
                      // A console preview of a library file: the one place a raw <img> is right.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.photo} alt="" className="size-16 rounded-full border border-line-strong bg-surface object-cover" />
                    ) : (
                      <span aria-hidden className="grid size-16 place-items-center rounded-full border border-dashed border-line-strong bg-surface text-12 text-faint">
                        {row.photo_path ? "Set" : "No photo"}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Field label="Name" htmlFor={id("name")} error={e.name} className="mb-3">
                      <Input id={id("name")} maxLength={120} value={row.name} onChange={(ev) => patch(row.key, { name: ev.target.value })} />
                    </Field>
                    <Field label="Role" htmlFor={id("role")} error={e.role} className="mb-2">
                      <Input id={id("role")} maxLength={160} value={row.role} onChange={(ev) => patch(row.key, { role: ev.target.value })} />
                    </Field>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <button
                        type="button" onClick={() => setPickFor(row.key)}
                        className="relative py-1 text-12-5 font-semibold text-brand-ink hover:underline"
                      >
                        {row.photo_path ? "Change photo" : "Choose a photo"}<span className="sr-only"> for {who}</span>
                      </button>
                      {row.photo_path && (
                        <button
                          type="button" onClick={() => patch(row.key, { photo_path: null, photo: null })}
                          className="relative py-1 text-12-5 font-semibold text-err hover:underline"
                        >
                          Remove photo<span className="sr-only"> of {who}</span>
                        </button>
                      )}
                    </div>
                    {e.photo_path && <p className="mt-1 text-12-5 text-err">{e.photo_path}</p>}
                    <Leftover errors={e} placed={["name", "role", "photo_path"]} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Button
        type="button" variant="secondary" size="sm" disabled={rows.length >= max}
        onClick={() => setRows((r) => [...r, { key: unusedKey(r.map((x) => x.key), "new-s"), name: "", role: "", photo_path: null, photo: null }])}
      >
        Add a speaker
      </Button>
      {rows.length >= max && <p className="mt-2 text-12-5 text-muted">An event holds at most {max} speakers.</p>}

      {/*
        `onPick` hands back both addresses and they are not interchangeable:
        the path is what is stored, the URL (which carries `?v=`) is only the
        preview. The dialog can upload too, so a photo that is not in the
        library yet does not mean leaving a half-filled form.
      */}
      <MediaBrowser
        open={pickFor !== null}
        onClose={() => setPickFor(null)}
        title="Choose a speaker's photo"
        onPick={(image) => {
          if (pickFor !== null) patch(pickFor, { photo_path: image.path, photo: image.url });
          setPickFor(null);
        }}
      />
    </fieldset>
  );
}

/* ------------------------------------------------------------ shared */

/** A 422 key on a row with no control of its own to sit under — shown, never swallowed. */
function Leftover({ errors, placed }: { errors: Record<string, string>; placed: string[] }) {
  const rest = Object.entries(errors).filter(([sub]) => !placed.includes(sub));
  if (rest.length === 0) return null;

  return (
    <ul className="mt-2 grid gap-1 text-12-5 text-err">
      {rest.map(([sub, message]) => <li key={sub}>{message}</li>)}
    </ul>
  );
}

/**
 * The hidden input a repeater posts through, kept in step with the form
 * around it — see the note at the top of this file for the three jobs.
 *
 * `fromDraft` is a module-level function, so the listener effect has nothing
 * that changes between renders and is attached once.
 */
function useJsonRows<R>(
  posted: string, setRows: Dispatch<SetStateAction<R[]>>, fromDraft: (parsed: unknown[], current: R[]) => R[],
) {
  const input = useRef<HTMLInputElement>(null);
  const [epoch, setEpoch] = useState(0);

  /*
    Keyed on what would be posted rather than on a "first run" flag: an effect
    runs twice on mount in development, and a flag would mark an untouched
    form dirty on its second pass.
  */
  const announced = useRef(posted);
  useEffect(() => {
    if (announced.current === posted) return;
    announced.current = posted;
    input.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [posted]);

  useEffect(() => {
    const el = input.current;
    const form = el?.closest("form");
    if (!el || !form) return;

    const restored = () => {
      // The draft held what is already here: nothing to rebuild, and rebuilding
      // would drop a blank row somebody was about to fill in.
      if (el.value === announced.current) return;
      try {
        const parsed: unknown = JSON.parse(el.value);
        if (Array.isArray(parsed)) setRows((current) => fromDraft(parsed, current));
      } catch { /* not ours to fix */ }
    };
    const redraw = () => setEpoch((n) => n + 1);

    form.addEventListener("tw:draft-restored", restored);
    form.addEventListener("reset", redraw);
    return () => {
      form.removeEventListener("tw:draft-restored", restored);
      form.removeEventListener("reset", redraw);
    };
  }, [setRows, fromDraft]);

  return { input, epoch };
}

/**
 * `prefix.N.sub` → the row that was posted Nth when the refusal arrived.
 *
 * A 422 names rows by position and positions move: reorder after a refused
 * save and `agenda.2.title` would sit under the wrong row. So the map is
 * pinned to row keys the moment it arrives — adjusted during render, the way
 * `Tabs` follows its nonce, so the messages are on screen in the first paint
 * after the refusal. `postedKeys` is the rows that were actually sent, in
 * order, because an entirely blank row is left out of the JSON and the API
 * counts only what it was given.
 */
function usePinnedErrors(errors: Record<string, string[]> | undefined, prefix: string, postedKeys: string[]): RowErrors {
  const [pinned, setPinned] = useState(() => ({ from: errors, byRow: pin(errors, prefix, postedKeys) }));
  if (errors !== pinned.from) setPinned({ from: errors, byRow: pin(errors, prefix, postedKeys) });

  return pinned.byRow;
}

function pin(errors: Record<string, string[]> | undefined, prefix: string, postedKeys: string[]): RowErrors {
  const byRow: RowErrors = {};

  for (const [key, messages] of Object.entries(errors ?? {})) {
    if (!key.startsWith(`${prefix}.`) || !messages?.[0]) continue;
    const [index, ...rest] = key.slice(prefix.length + 1).split(".");
    const row = /^\d+$/.test(index) ? postedKeys[Number(index)] : undefined;
    if (!row || rest.length === 0) continue;
    (byRow[row] ??= {})[rest.join(".")] = messages[0];
  }

  return byRow;
}

function moved<R>(rows: R[], i: number, by: number): R[] {
  const to = i + by;
  if (to < 0 || to >= rows.length) return rows;
  const copy = [...rows];
  [copy[i], copy[to]] = [copy[to], copy[i]];
  return copy;
}

/** The first `prefix`+number that none of `keys` already is. Pure, so it is safe inside a state updater. */
function unusedKey(keys: string[], prefix: string): string {
  let n = keys.length + 1;
  while (keys.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** A row with anything in it is posted — a title-less one too, so the API can say what it is missing. */
const agendaFilled = (r: AgendaRow) => Boolean(r.time.trim() || r.title.trim() || r.note.trim());
const speakerFilled = (r: SpeakerRow) => Boolean(r.name.trim() || r.role.trim() || r.photo_path);

function agendaRows(items: { time?: unknown; title?: unknown; note?: unknown }[], prefix: string): AgendaRow[] {
  return items.map((item, i) => ({ key: `${prefix}${i}`, time: text(item.time), title: text(item.title), note: text(item.note) }));
}

function speakerRows(
  items: { name?: unknown; role?: unknown; photo_path?: unknown; photo?: unknown }[], prefix: string,
): SpeakerRow[] {
  return items.map((item, i) => ({
    key: `${prefix}${i}`,
    name: text(item.name),
    role: text(item.role),
    photo_path: text(item.photo_path) || null,
    photo: text(item.photo) || null,
  }));
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Rows read back out of a restored draft: the posted shape, under keys of their own. */
function agendaRowsFromDraft(parsed: unknown[]): AgendaRow[] {
  return agendaRows(parsed.filter(isObject), "d");
}

/*
  A draft holds what was posted, which is the path and never the preview URL.
  A path one of the rows on screen already shows keeps that row's picture; a
  path only the draft knows shows "Set" in place of the picture until the
  form is saved. The photo itself is not lost either way.
*/
function speakerRowsFromDraft(parsed: unknown[], current: SpeakerRow[]): SpeakerRow[] {
  return speakerRows(parsed.filter(isObject), "d").map((row) => ({
    ...row,
    photo: row.photo_path ? current.find((c) => c.photo_path === row.photo_path)?.photo ?? null : null,
  }));
}
