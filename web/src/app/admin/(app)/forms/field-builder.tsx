"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { IconChevronDown } from "@/components/icons-ui";
import type {
  AdminFormField, FormFieldOption, FormFieldPayload, FormFieldSettings, FormKindOption, FormMeta, FormShowIf,
} from "@/lib/admin";
import {
  canBeConditionSource, canCarryCondition, FILE_DEFAULT_KB, FILE_MAX_KB, FILE_MIN_KB, isFileKind, isLayoutKind,
  kindLabel, kindsFrom, MAX_FIELD_ROWS, MAX_FILE_FIELDS, opsFrom, takesOptions, type ConditionOp,
} from "./form-kinds";

/**
 * One option of a dropdown, a radio group or a checkbox group.
 *
 * `value` is what a submission stores and what a condition compares against,
 * so once an option has been **saved** its value is fixed and only the label
 * the visitor reads can change — correcting "Slaes" to "Sales" must not
 * orphan every answer already collected under it. A new option's value is
 * derived from its label when the form is saved.
 */
type OptionRow = { key: string; value: string; label: string; saved: boolean };

/**
 * "Show this field only when…", held by the **row** it reads rather than by
 * that row's name.
 *
 * The API's `show_if.field` is a name. Holding the name here would break the
 * condition on every keystroke of a rename — and a new field's key follows
 * its label as it is typed — so the editor points at the source row's own key
 * and writes the name out when the form is posted. `field` is the last name
 * the source was known by: what the warning line quotes, and what is posted,
 * once the source has been removed.
 */
type Condition = { sourceKey: string | null; field: string; op: string; value: string };

type Row = {
  /** The row's identity in this editor only — never posted. */
  key: string;
  /** The key follows the label until the field is saved or the key is typed by hand. */
  fresh: boolean;
  kind: string;
  name: string;
  label: string;
  placeholder: string;
  help: string;
  required: boolean;
  width: "half" | "full";
  options: OptionRow[];
  /** `number` and `date` limits, as typed. */
  min: string;
  max: string;
  /** `hidden`: the stored value. */
  value: string;
  /** `file`: accepted families, and the size limit in MB as typed. */
  accept: string[];
  maxMb: string;
  condition: Condition | null;
};

/** What a row is built from: a saved field, or a posted one read back out of a draft. */
type Source = {
  id?: number;
  kind: string;
  name?: string;
  label?: string;
  placeholder?: string | null;
  help?: string | null;
  required?: boolean;
  width?: "half" | "full";
  options?: FormFieldOption[] | null;
  settings?: FormFieldSettings | null;
  show_if?: FormShowIf | null;
};

/** Sub-keys of `fields.N.*` that have a control of their own to sit under. */
const PLACED = new Set([
  "kind", "name", "label", "placeholder", "help", "options",
  "settings.min", "settings.max", "settings.value", "settings.accept", "settings.max_kb",
  "show_if.field", "show_if.op", "show_if.value",
]);

/** Kinds with nothing to show inside the control before it is filled in. */
const NO_PLACEHOLDER = new Set(["radio", "checkboxes", "checkbox", "rating", "file", "hidden", "date"]);

/**
 * The fields, edited as a list and submitted as one JSON field.
 *
 * **The kinds, the operators and the upload families come from the API's
 * `meta`**, never a list here (`form-kinds.ts` holds only the fallback for an
 * API that sends none). What this file does know is what each kind *asks
 * for*: a number has limits, a hidden field has a value, an upload has
 * families and a size — those are controls, and a control is drawn by code.
 *
 * The key is the part worth being careful about: it is what the answer is
 * stored and emailed under, so it is derived from the label on first entry and
 * then left alone. Renaming a key silently orphans every answer already
 * collected under the old one — the hint says so rather than the form
 * preventing it, because sometimes renaming is exactly what is wanted.
 *
 * A heading and a step break are rows in the same list, because their place
 * among the fields is the whole of what they are; they carry no key, no
 * "required" and no placeholder, and the API names them itself.
 */
export function FieldBuilder({
  fields, meta, errors,
}: {
  fields: AdminFormField[];
  meta?: FormMeta;
  /** The action's 422 map. `fields.N.*` keys are drawn on row N. */
  errors?: Record<string, string[]>;
}) {
  const kinds = kindsFrom(meta);
  const ops = opsFrom(meta);
  const accepts = meta?.file_accepts ?? [];
  const capKb = Math.min(FILE_MAX_KB, meta?.max_upload_kb ?? FILE_MAX_KB);
  const maxFiles = meta?.max_file_fields ?? MAX_FILE_FIELDS;

  const [rows, setRows] = useState<Row[]>(() => toRows(fields, "f"));
  const input = useRef<HTMLInputElement>(null);

  /*
    A 422 names rows by position, and positions move: reorder after a refused
    save and "fields.2.label" would sit under the wrong row. So the map is
    pinned to row keys the moment it arrives — adjusted during render, the way
    `Tabs` follows its nonce, so the messages are on screen in the first paint
    after the refusal.
  */
  const [pinned, setPinned] = useState(() => ({ from: errors, byRow: pinErrors(errors, rows) }));
  if (errors !== pinned.from) setPinned({ from: errors, byRow: pinErrors(errors, rows) });

  /*
    A structural change — add, move, remove, a ticked box — fires no input
    event the form can hear, so the leave guard and the draft keeper are told
    here. Keyed on what would be posted rather than on a "first run" flag: an
    effect runs twice on mount in development, and a flag would mark an
    untouched form dirty on its second pass.
  */
  const posted = JSON.stringify(rows.map((_, i) => toPayload(rows, i, kinds, ops, capKb)));
  const announced = useRef(posted);
  useEffect(() => {
    if (announced.current === posted) return;
    announced.current = posted;
    input.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [posted]);

  // `FormDraft` writes a restored draft into the hidden input; read it back.
  useEffect(() => {
    const el = input.current;
    const form = el?.closest("form");
    if (!el || !form) return;
    const restored = () => {
      try {
        const parsed: unknown = JSON.parse(el.value);
        if (Array.isArray(parsed)) setRows(toRows(parsed.filter(isSource), "d"));
      } catch { /* not ours to fix */ }
    };
    /*
      Nothing here redraws the list after a refused save. The selects and
      tick boxes below are controlled and unnamed, which is the case React's
      form reset gets wrong, and `<Form>` puts those back itself
      (`components/ui/form.tsx`, `scripts/probes/form-reset-controls.mjs`).
    */
    form.addEventListener("tw:draft-restored", restored);
    return () => form.removeEventListener("tw:draft-restored", restored);
  }, []);

  /*
    Which rows are unfolded. A saved form of any size opens folded: seventeen
    open cards measured 8,600px, a page nobody can scan or reorder (0.117.0).
    A short form opens whole, a row opens as it is added, and a row holding a
    422 is open whatever this says — a message inside a folded card is the
    hidden-tab failure one level down. Editor state only; nothing is posted.
  */
  const [open, setOpen] = useState<Set<string>>(() => new Set(rows.length > 3 ? [] : rows.map((r) => r.key)));
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const patch = (i: number, next: Partial<Row>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next } : row)));

  const move = (i: number, by: number) =>
    setRows((r) => {
      const to = i + by;
      if (to < 0 || to >= r.length) return r;
      const copy = [...r];
      [copy[i], copy[to]] = [copy[to], copy[i]];
      return copy;
    });

  /*
    Removing a field does not remove the conditions that read it. They are
    kept, pointed at nothing, with the name they last knew — so each shows its
    warning line and the editor decides what replaces it, rather than a field
    quietly becoming always-visible.
  */
  const remove = (i: number) =>
    setRows((r) => {
      const gone = r[i];
      return r.filter((_, n) => n !== i).map((row) =>
        row.condition?.sourceKey === gone.key
          ? { ...row, condition: { ...row.condition, sourceKey: null, field: gone.name } }
          : row);
    });

  const add = (kind: string) => {
    const key = unusedKey(rows.map((row) => row.key), "new-");
    setRows((r) => [...r, {
      ...blank(key, kind),
      ...(isFileKind(kinds, kind) ? { accept: defaultAccept(accepts) } : {}),
    }]);
    setOpen((was) => new Set(was).add(key));
  };

  const setKind = (i: number, kind: string) =>
    patch(i, {
      kind, min: "", max: "",
      ...(isFileKind(kinds, kind) && rows[i].accept.length === 0 ? { accept: defaultAccept(accepts) } : {}),
    });

  const fileCount = rows.filter((r) => isFileKind(kinds, r.kind)).length;
  const stepCount = rows.filter((r) => r.kind === "step").length;
  const valueKinds = kinds.filter((k) => !k.is_layout);
  const layoutKinds = kinds.filter((k) => k.is_layout);
  const firstKind = valueKinds.find((k) => k.value === "text")?.value ?? valueKinds[0]?.value ?? "text";
  const full = rows.length >= MAX_FIELD_ROWS;

  return (
    <div>
      <input ref={input} type="hidden" name="fields" value={posted} />

      {errors?.fields?.[0] && <p className="mb-3 text-13 text-err">{errors.fields[0]}</p>}

      {rows.length === 0 && (
        <p className="mb-4 rounded border border-dashed border-line-strong px-4 py-6 text-center text-13-5 text-muted">
          No fields yet. A form with no fields is not published anywhere — the public
          endpoint answers 404 rather than showing an empty box.
        </p>
      )}

      {stepCount > 0 && (
        <p className="mb-3 text-13 text-muted">
          This form is filled in over {stepCount + 1} steps. The visitor sees one at a time, and
          what is above the first break is the first step.
        </p>
      )}

      <ol className="grid gap-4">
        {rows.map((row, i) => {
          const e = pinned.byRow[row.key] ?? {};
          const other = Object.entries(e).filter(([sub]) => !PLACED.has(sub) && !sub.startsWith("options."));
          const id = (part: string) => `${part}-${row.key}`;
          const unfolded = open.has(row.key) || Object.keys(e).length > 0;

          if (row.kind === "step") {
            // The first break opens step two, the next one step three, and so on down.
            const opens = rows.slice(0, i + 1).filter((r) => r.kind === "step").length + 1;
            const empty = i === rows.length - 1
              ? "Nothing sits below this break, so it makes an empty last step."
              : i === 0
                ? "Nothing sits above this break, so the form opens on an empty step."
                : rows[i - 1].kind === "step"
                  ? "Nothing sits between this break and the one before it, so it makes an empty step."
                  : null;
            return (
              <li key={row.key} className="min-w-0 rounded-lg border border-dashed border-line-strong bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-13 font-semibold text-muted">Step break</span>
                  <ReorderButtons
                    className="ml-auto" index={i} count={rows.length} subject={`the step break in row ${i + 1}`}
                    onMove={(by) => move(i, by)} onRemove={() => remove(i)}
                  />
                </div>
                <p className="mb-3 text-center text-13-5 font-semibold [overflow-wrap:anywhere]" aria-hidden="true">
                  — Step: {row.label.trim() || `Step ${opens}`} —
                </p>
                <Field
                  label="Step title" htmlFor={id("label")} error={e.label}
                  hint={`Everything from here to the next break is one step, shown under this title. Left blank, it is called “Step ${opens}”.`}
                >
                  <Input id={id("label")} value={row.label} onChange={(ev) => patch(i, { label: ev.target.value })} />
                </Field>
                {empty && <p className="text-12-5 text-warn">{empty}</p>}
                <Leftover errors={other} />
              </li>
            );
          }

          if (isLayoutKind(kinds, row.kind)) {
            return (
              <li key={row.key} className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
                <div className={`flex flex-wrap items-center gap-2 ${unfolded ? "mb-3" : ""}`}>
                  <RowToggle
                    open={unfolded} controls={id("body")} onToggle={() => toggle(row.key)}
                    lead={kindLabel(kinds, row.kind)} title={row.label}
                    notes={[row.condition ? "Conditional" : ""]}
                  />
                  <ReorderButtons
                    className="ml-auto" index={i} count={rows.length}
                    subject={`the ${kindLabel(kinds, row.kind).toLowerCase()} in row ${i + 1}`}
                    onMove={(by) => move(i, by)} onRemove={() => remove(i)}
                  />
                </div>
                <div id={id("body")} hidden={!unfolded}>
                <Field label="Heading" htmlFor={id("label")} error={e.label}>
                  <Input id={id("label")} value={row.label} onChange={(ev) => patch(i, { label: ev.target.value })} />
                </Field>
                <Field
                  label="Text under it" htmlFor={id("help")} error={e.help}
                  hint="Optional. A sentence or two, shown as a paragraph beneath the heading."
                >
                  <Textarea id={id("help")} rows={2} value={row.help} onChange={(ev) => patch(i, { help: ev.target.value })} />
                </Field>
                <Leftover errors={other} />
                {canCarryCondition(row.kind) && (
                  <ConditionEditor
                    rows={rows} index={i} kinds={kinds} ops={ops} noun="heading"
                    errors={{ field: e["show_if.field"], op: e["show_if.op"], value: e["show_if.value"] }}
                    onChange={(condition) => patch(i, { condition })}
                  />
                )}
                </div>
              </li>
            );
          }

          const hidden = row.kind === "hidden";
          const file = isFileKind(kinds, row.kind);
          const blurb = kinds.find((k) => k.value === row.kind)?.blurb;

          return (
            <li key={row.key} className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
              <div className={`flex flex-wrap items-center gap-2 ${unfolded ? "mb-3" : ""}`}>
                <RowToggle
                  open={unfolded} controls={id("body")} onToggle={() => toggle(row.key)}
                  lead={`Field ${i + 1}`} title={row.label}
                  notes={[
                    kindLabel(kinds, row.kind),
                    row.required && !hidden ? "Required" : "",
                    row.condition ? "Conditional" : "",
                  ]}
                />
                <ReorderButtons
                  className="ml-auto" index={i} count={rows.length} subject={`field ${i + 1}`}
                  onMove={(by) => move(i, by)} onRemove={() => remove(i)}
                />
              </div>

              <div id={id("body")} hidden={!unfolded}>
              <Leftover errors={other} />

              <div className="grid gap-x-3 sm:grid-cols-2">
                <Field
                  label="Label" htmlFor={id("label")} error={e.label}
                  hint={hidden ? "Never shown to the visitor — it names the value in the submission and the email." : undefined}
                >
                  <Input
                    id={id("label")}
                    value={row.label}
                    onChange={(ev) => {
                      const label = ev.target.value;
                      // The key follows the label until the field has been
                      // saved once; after that it is the editor's to change.
                      patch(i, row.fresh ? { label, name: keyFrom(label) } : { label });
                    }}
                  />
                </Field>

                <Field
                  label="Key" htmlFor={id("name")} error={e.name}
                  hint="Stored and emailed under this. Changing it orphans answers already collected."
                >
                  <Input
                    id={id("name")}
                    className="font-mono"
                    value={row.name}
                    onChange={(ev) => patch(i, { name: keyTyped(ev.target.value), fresh: false })}
                  />
                </Field>

                <Field
                  label="Type" htmlFor={id("kind")} variant="float-static" error={e.kind}
                  hint={!file && fileCount >= maxFiles
                    ? `${blurb ? `${blurb} ` : ""}A form takes at most ${maxFiles} upload fields, and this one has them.`
                    : blurb || undefined}
                >
                  <Select id={id("kind")} value={row.kind} onChange={(ev) => setKind(i, ev.target.value)}>
                    {/* A kind this console was not told about is still the field's kind; show it rather than the first option. */}
                    {!valueKinds.some((k) => k.value === row.kind) && <option value={row.kind}>{row.kind}</option>}
                    {valueKinds.map((k) => (
                      <option
                        key={k.value} value={k.value}
                        disabled={Boolean(k.is_file) && !file && fileCount >= maxFiles}
                      >
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                {!hidden && (
                  <Field label="Width" htmlFor={id("width")} variant="float-static">
                    <Select
                      id={id("width")}
                      value={row.width}
                      onChange={(ev) => patch(i, { width: ev.target.value === "half" ? "half" : "full" })}
                    >
                      <option value="full">Full width</option>
                      <option value="half">Half width</option>
                    </Select>
                  </Field>
                )}

                {!NO_PLACEHOLDER.has(row.kind) && (
                  <Field label="Placeholder" htmlFor={id("ph")} error={e.placeholder}>
                    <Input id={id("ph")} value={row.placeholder} onChange={(ev) => patch(i, { placeholder: ev.target.value })} />
                  </Field>
                )}

                {!hidden && (
                  <Field label="Help text" htmlFor={id("help")} error={e.help}>
                    <Input id={id("help")} value={row.help} onChange={(ev) => patch(i, { help: ev.target.value })} />
                  </Field>
                )}
              </div>

              {takesOptions(kinds, row.kind) && (
                <OptionsEditor
                  rowKey={row.key}
                  options={row.options}
                  // A dropdown may offer one thing; a choice between options needs two.
                  least={row.kind === "select" ? 1 : 2}
                  error={e.options ?? Object.entries(e).find(([sub]) => sub.startsWith("options."))?.[1]}
                  onChange={(options) => patch(i, { options })}
                />
              )}

              {row.kind === "number" && (
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <Field label="Smallest allowed" htmlFor={id("min")} error={e["settings.min"]} hint="Blank for no limit.">
                    <Input id={id("min")} type="number" step="any" value={row.min} onChange={(ev) => patch(i, { min: ev.target.value })} />
                  </Field>
                  <Field label="Largest allowed" htmlFor={id("max")} error={e["settings.max"]} hint="Blank for no limit.">
                    <Input id={id("max")} type="number" step="any" value={row.max} onChange={(ev) => patch(i, { max: ev.target.value })} />
                  </Field>
                </div>
              )}

              {row.kind === "date" && (
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <DateLimit
                    id={id("min")} label="Earliest date" value={row.min} error={e["settings.min"]}
                    onChange={(min) => patch(i, { min })}
                  />
                  <DateLimit
                    id={id("max")} label="Latest date" value={row.max} error={e["settings.max"]}
                    onChange={(max) => patch(i, { max })}
                  />
                </div>
              )}

              {hidden && (
                <Field
                  label="Stored value" htmlFor={id("value")} error={e["settings.value"]}
                  hint="Saved with every submission, and never shown or editable on the page — a campaign name, the page the form sits on."
                >
                  <Input id={id("value")} maxLength={255} value={row.value} onChange={(ev) => patch(i, { value: ev.target.value })} />
                </Field>
              )}

              {file && (
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <fieldset className="mb-[18px] min-w-0">
                    <legend className="mb-[7px] text-13-5 font-semibold">Files accepted</legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {accepts.map((a) => (
                        <label key={a.value} className="flex items-center gap-2.5 text-13-5">
                          <input
                            type="checkbox"
                            className="size-4 accent-brand-600"
                            checked={row.accept.includes(a.value)}
                            onChange={(ev) => patch(i, {
                              // Kept in the API's own order, so the stored list reads the way the picker does.
                              accept: accepts.map((x) => x.value).filter((v) =>
                                v === a.value ? ev.target.checked : row.accept.includes(v)),
                            })}
                          />
                          <span>
                            {a.label}
                            {a.extensions?.length ? <span className="text-faint"> ({a.extensions.join(", ")})</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                    {e["settings.accept"]
                      ? <p className="mt-1.5 text-12-5 text-err">{e["settings.accept"]}</p>
                      : <p className="mt-1.5 text-12-5 text-faint">
                          The upload is checked by its contents, not by the name it arrives under.
                        </p>}
                  </fieldset>

                  <Field
                    label="Largest file, in MB" htmlFor={id("maxmb")} error={e["settings.max_kb"]}
                    hint={`From ${megabytes(FILE_MIN_KB)} to ${megabytes(capKb)} MB — the most this server will accept for one file.`}
                  >
                    <Input
                      id={id("maxmb")} type="number" inputMode="decimal" step="0.5"
                      min={megabytes(FILE_MIN_KB)} max={megabytes(capKb)}
                      value={row.maxMb}
                      onChange={(ev) => patch(i, { maxMb: ev.target.value })}
                      // What is posted is the clamped figure, so the box settles on it too.
                      onBlur={() => patch(i, { maxMb: megabytes(clampKb(row.maxMb, capKb)) })}
                    />
                  </Field>
                </div>
              )}

              {!hidden && (
                <label className="flex items-center gap-2.5 text-13-5">
                  <input
                    type="checkbox"
                    checked={row.required}
                    onChange={(ev) => patch(i, { required: ev.target.checked })}
                    className="size-4 accent-brand-600"
                  />
                  Required
                </label>
              )}

              {canCarryCondition(row.kind) && (
                <ConditionEditor
                  rows={rows} index={i} kinds={kinds} ops={ops} noun="field"
                  errors={{ field: e["show_if.field"], op: e["show_if.op"], value: e["show_if.value"] }}
                  onChange={(condition) => patch(i, { condition })}
                />
              )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={full} onClick={() => add(firstKind)}>
          Add a field
        </Button>
        {/* Layout rows sit apart from the fields: they are placed, not answered. */}
        {layoutKinds.map((k) => (
          <Button key={k.value} type="button" variant="ghost" size="sm" disabled={full} onClick={() => add(k.value)}>
            {k.value === "heading" ? "Add a heading" : k.value === "step" ? "Add a step break" : `Add: ${k.label}`}
          </Button>
        ))}
      </div>
      {full && (
        <p className="mt-2 text-12-5 text-muted">
          A form holds at most {MAX_FIELD_ROWS} rows, headings and step breaks included. Remove one to add another.
        </p>
      )}
    </div>
  );
}

/**
 * A row's heading, which is also what folds it.
 *
 * Folded, it is the whole of the row: which field, what it is called and the
 * three facts worth knowing without opening it. The body stays mounted behind
 * `hidden` — its controls feed one JSON input, so nothing is lost either way,
 * but an input that keeps its focus and its undo history is the cheaper rule.
 */
function RowToggle({
  open, controls, onToggle, lead, title, notes,
}: {
  open: boolean;
  controls: string;
  onToggle: () => void;
  lead: string;
  title: string;
  notes: string[];
}) {
  const said = notes.filter(Boolean).join(" · ");
  return (
    <button
      type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}
      className="flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded text-left"
    >
      <IconChevronDown className={`size-4 shrink-0 text-muted ${open ? "" : "-rotate-90"}`} />
      <span className="shrink-0 text-13 font-semibold text-muted">{lead}</span>
      <span className="min-w-0 truncate text-13-5 font-semibold">{title.trim() || "Untitled"}</span>
      {said && <span className="hidden shrink-0 text-12-5 text-muted sm:inline">{said}</span>}
    </button>
  );
}

/** A 422 key with no control of its own on the row — shown, never swallowed. */
function Leftover({ errors }: { errors: [string, string][] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="mb-3 grid gap-1 text-12-5 text-err">
      {errors.map(([sub, message]) => <li key={sub}>{message}</li>)}
    </ul>
  );
}

/**
 * The options of a dropdown, a radio group or a checkbox group.
 *
 * A row per option rather than one-per-line in a textarea, for the reason
 * `OptionRow` gives: a textarea can only re-derive every value from its
 * label, so fixing a spelling would rename the stored value. Pasting several
 * lines into a row still fills several rows, which is the one thing the
 * textarea was good at.
 */
function OptionsEditor({
  rowKey, options, least, error, onChange,
}: {
  rowKey: string;
  options: OptionRow[];
  /** The fewest options this kind can be saved with. */
  least: number;
  error?: string;
  onChange: (next: OptionRow[]) => void;
}) {
  /** New rows for these labels, each under a key no row of this list holds. */
  const fresh = (labels: string[]): OptionRow[] => {
    const keys = options.map((o) => o.key);
    return labels.map((label) => {
      const key = unusedKey(keys, `${rowKey}-n`);
      keys.push(key);
      return { key, value: "", label, saved: false };
    });
  };

  const move = (n: number, by: number) => {
    const to = n + by;
    if (to < 0 || to >= options.length) return;
    const copy = [...options];
    [copy[n], copy[to]] = [copy[to], copy[n]];
    onChange(copy);
  };

  return (
    <fieldset className="mb-[18px] min-w-0">
      <legend className="mb-[7px] text-13-5 font-semibold">Options</legend>

      {options.length > 0 && (
        <ol className="mb-2 grid gap-2">
          {options.map((option, n) => (
            <li key={option.key} className="flex min-w-0 items-center gap-2">
              <Input
                aria-label={`Option ${n + 1}`}
                className="min-w-0 flex-1"
                value={option.label}
                onChange={(ev) => onChange(options.map((o, m) => (m === n ? { ...o, label: ev.target.value } : o)))}
                onPaste={(ev) => {
                  const lines = ev.clipboardData.getData("text").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                  if (lines.length < 2) return;
                  // A pasted list: the first line lands in this row, the rest become rows after it.
                  ev.preventDefault();
                  onChange([
                    ...options.slice(0, n),
                    { ...option, label: lines[0] },
                    ...fresh(lines.slice(1)),
                    ...options.slice(n + 1),
                  ]);
                }}
              />
              <ReorderButtons
                dense index={n} count={options.length} subject={`option ${n + 1}`}
                onMove={(by) => move(n, by)}
                onRemove={() => onChange(options.filter((_, m) => m !== n))}
              />
            </li>
          ))}
        </ol>
      )}

      <Button
        type="button" variant="ghost" size="sm" disabled={options.length >= 50}
        onClick={() => onChange([...options, ...fresh([""])])}
      >
        Add an option
      </Button>

      {error
        ? <p id={`opt-${rowKey}-error`} className="mt-1.5 text-12-5 text-err">{error}</p>
        : <p className="mt-1.5 text-12-5 text-faint">
            At least {least === 1 ? "one" : "two"} and at most 50, and the only answers the API will
            accept for this field. Paste a list to add several at once. Rewording a saved option keeps
            the answers already collected under it.
          </p>}
    </fieldset>
  );
}

/**
 * One end of a date field's range: no limit, today, or a fixed date.
 *
 * "Today" is stored as the word, not as a date — it means today on the day
 * the visitor opens the form, which is the whole point of a field that must
 * not accept a date in the past.
 */
function DateLimit({
  id, label, value, error, onChange,
}: { id: string; label: string; value: string; error?: string; onChange: (next: string) => void }) {
  const mode = value === "" ? "none" : value === "today" ? "today" : "date";

  return (
    <div className="mb-[18px] min-w-0">
      <Field label={label} htmlFor={id} variant="float-static" error={error} className="mb-0">
        <Select
          id={id}
          value={mode}
          onChange={(ev) => onChange(ev.target.value === "none" ? "" : ev.target.value === "today" ? "today" : todayLocal())}
        >
          <option value="none">No limit</option>
          <option value="today">Today</option>
          <option value="date">A date</option>
        </Select>
      </Field>
      {mode === "date" && (
        <Input
          type="date" aria-label={`${label}: the date`} className="mt-2"
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
        />
      )}
    </div>
  );
}

/**
 * "Show this field only when…".
 *
 * Closed, it is one button — and that button is offered only where a
 * condition could be written: there is an earlier field it could read, and
 * the API sent its operators. Open, it is a source, an operator and (where
 * the operator compares against something) a value, with "Always show" as the
 * way back.
 *
 * A condition whose source has been removed, moved below this field or
 * turned into something a condition cannot read is **kept and flagged**.
 * Dropping it would turn a field somebody deliberately hid into one every
 * visitor sees, with nothing on this screen having said so.
 */
function ConditionEditor({
  rows, index, kinds, ops, noun, errors, onChange,
}: {
  rows: Row[];
  index: number;
  kinds: FormKindOption[];
  ops: ConditionOp[];
  /** What the row is, for the button and the warnings: "field" or "heading". */
  noun: string;
  errors: { field?: string; op?: string; value?: string };
  onChange: (next: Condition | null) => void;
}) {
  const row = rows[index];
  const c = row.condition;
  // A field with no key yet cannot be named in a condition — unless it already is, mid-rename.
  const sources = rows.slice(0, index).filter((r) =>
    canBeConditionSource(kinds, r.kind) && (r.name !== "" || r.key === c?.sourceKey));
  const title = (r: Row) => r.label.trim() || r.name;

  if (!c) {
    const nearest = sources[sources.length - 1];
    if (!nearest || ops.length === 0) return null;

    return (
      <div className="mt-3">
        <Button
          type="button" variant="ghost" size="sm"
          onClick={() => onChange({ sourceKey: nearest.key, field: nearest.name, op: ops[0].value, value: "" })}
        >
          Show this {noun} only when…
        </Button>
      </div>
    );
  }

  const source = rows.find((r) => r.key === c.sourceKey) ?? null;
  const problem = !source
    ? `"${c.field}" is no longer a field on this form, so this condition has nothing to read. Choose another field, or press Always show.`
    : rows.indexOf(source) >= index
      ? `"${title(source)}" now sits below this ${noun}, and a condition can only read a field above it. Move one of them, choose another field, or press Always show.`
      : !canBeConditionSource(kinds, source.kind)
        ? `"${title(source)}" is now a ${kindLabel(kinds, source.kind).toLowerCase()}, which a condition cannot read. Choose another field, or press Always show.`
        : null;

  const op = ops.find((o) => o.value === c.op);
  const needsValue = op?.needs_value ?? true;
  const choices = source && !problem ? choicesOf(source, kinds) : null;
  // "Includes" asks whether one of several ticked boxes is this one, so it
  // reads a multiple-choice field and nothing else; the API refuses it elsewhere.
  const several = source?.kind === "checkboxes";
  const id = (part: string) => `cond-${part}-${row.key}`;

  return (
    <div className="mt-3 min-w-0 rounded border border-line bg-surface p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-13 font-semibold">Show this {noun} only when…</p>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => onChange(null)}>
          Always show
        </Button>
      </div>

      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="This field" htmlFor={id("field")} variant="float-static" error={errors.field}>
          <Select
            id={id("field")}
            value={problem ? "" : c.sourceKey ?? ""}
            onChange={(ev) => {
              const next = rows.find((r) => r.key === ev.target.value);
              if (!next) return;
              onChange({
                ...c, sourceKey: next.key, field: next.name, value: "",
                // "Includes" does not survive a move to a field that is not multiple choice.
                op: c.op === "includes" && next.kind !== "checkboxes" ? ops[0]?.value ?? c.op : c.op,
              });
            }}
          >
            {problem && <option value="">{source ? title(source) : c.field} — not available</option>}
            {sources.map((r) => <option key={r.key} value={r.key}>{title(r)}</option>)}
          </Select>
        </Field>

        <Field label="Is" htmlFor={id("op")} variant="float-static" error={errors.op}>
          <Select id={id("op")} value={c.op} onChange={(ev) => onChange({ ...c, op: ev.target.value })}>
            {!op && <option value={c.op}>{c.op}</option>}
            {ops.map((o) => (
              <option key={o.value} value={o.value} disabled={o.value === "includes" && !several && c.op !== "includes"}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        {needsValue && (choices ? (
          <Field label="This answer" htmlFor={id("value")} variant="float-static" error={errors.value}>
            <Select id={id("value")} value={c.value} onChange={(ev) => onChange({ ...c, value: ev.target.value })}>
              <option value="">Choose…</option>
              {c.value !== "" && !choices.some((o) => o.value === c.value) && (
                <option value={c.value}>{c.value} — no longer an option</option>
              )}
              {choices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="This answer" htmlFor={id("value")} error={errors.value}>
            <Input id={id("value")} maxLength={150} value={c.value} onChange={(ev) => onChange({ ...c, value: ev.target.value })} />
          </Field>
        ))}
      </div>

      {problem && <p className="text-12-5 text-warn">{problem}</p>}
      {!problem && c.op === "includes" && !several && (
        <p className="text-12-5 text-warn">
          “{op?.label ?? c.op}” reads a multiple-choice field, and this one is not. Choose another way to compare.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ the wire */

function blank(key: string, kind: string): Row {
  return {
    key, fresh: true, kind, name: "", label: "", placeholder: "", help: "",
    required: false, width: "full", options: [], min: "", max: "", value: "",
    accept: [], maxMb: megabytes(FILE_DEFAULT_KB), condition: null,
  };
}

/** Image and PDF where the API offers them (the API's own default), otherwise everything it offers. */
function defaultAccept(accepts: { value: string }[]): string[] {
  const usual = accepts.map((a) => a.value).filter((v) => v === "image" || v === "pdf");
  return usual.length ? usual : accepts.map((a) => a.value);
}

function isSource(value: unknown): value is Source {
  return typeof value === "object" && value !== null && typeof (value as { kind?: unknown }).kind === "string";
}

/** Rows from saved (or drafted) fields, with each condition tied to the row it reads. */
function toRows(fields: Source[], prefix: string): Row[] {
  const rows = fields.map((f, i): Row => {
    const key = `${prefix}${f.id ?? "n"}-${i}`;
    const s = f.settings ?? {};

    return {
      ...blank(key, f.kind),
      fresh: !f.id && !f.name,
      name: f.name ?? "",
      label: f.label ?? "",
      placeholder: f.placeholder ?? "",
      help: f.help ?? "",
      required: Boolean(f.required),
      width: f.width === "half" ? "half" : "full",
      options: (f.options ?? []).map((o, n) => ({ key: `${key}-o${n}`, value: o.value, label: o.label, saved: true })),
      min: s.min === null || s.min === undefined ? "" : String(s.min),
      max: s.max === null || s.max === undefined ? "" : String(s.max),
      value: s.value ?? "",
      accept: s.accept ?? [],
      maxMb: megabytes(s.max_kb ?? FILE_DEFAULT_KB),
    };
  });

  return rows.map((row, i) => {
    const c = fields[i].show_if;
    if (!c?.field) return row;

    // The field it names, looked for above first: two rows may briefly share a name.
    const source = rows.slice(0, i).find((r) => r.name === c.field) ?? rows.find((r) => r !== row && r.name === c.field);
    return { ...row, condition: { sourceKey: source?.key ?? null, field: c.field, op: c.op, value: c.value ?? "" } };
  });
}

/**
 * What a condition on this field can be compared with, when that is a closed
 * list: its own options, one to five for a rating, and "Ticked" for a single
 * tick box — which the page holds as "1". Null for anything typed freely.
 */
function choicesOf(source: Row, kinds: FormKindOption[]): FormFieldOption[] | null {
  if (takesOptions(kinds, source.kind)) return optionsOf(source);
  if (source.kind === "rating") return [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
  if (source.kind === "checkbox") return [{ value: "1", label: "Ticked" }];
  return null;
}

/** An option list as it is posted: blank rows dropped, new values derived, none repeated. */
function optionsOf(row: Row): FormFieldOption[] {
  const taken = new Set(row.options.filter((o) => o.saved).map((o) => o.value));

  return row.options.filter((o) => o.label.trim() !== "").map((o) => {
    const label = o.label.trim();
    if (o.saved) return { value: o.value, label };

    const base = keyFrom(label) || label;
    let value = base;
    for (let n = 2; taken.has(value); n += 1) value = `${base}_${n}`;
    taken.add(value);
    return { value, label };
  });
}

function toPayload(rows: Row[], i: number, kinds: FormKindOption[], ops: ConditionOp[], capKb: number): FormFieldPayload {
  const row = rows[i];

  /*
    A heading or a step break: text and a place in the list. The API names it,
    and no id is sent for any row — the fields are replaced wholesale on every
    save, so an id would name a row that is about to stop existing.
  */
  if (row.kind === "step") return { kind: row.kind, label: row.label };
  if (isLayoutKind(kinds, row.kind)) {
    return { kind: row.kind, label: row.label, help: row.help || null, show_if: conditionOf(rows, i, ops) };
  }

  const hidden = row.kind === "hidden";

  return {
    kind: row.kind,
    name: row.name,
    label: row.label,
    placeholder: NO_PLACEHOLDER.has(row.kind) ? null : row.placeholder || null,
    help: hidden ? null : row.help || null,
    required: hidden ? false : row.required,
    width: row.width,
    options: takesOptions(kinds, row.kind) ? optionsOf(row) : [],
    settings: settingsOf(row, kinds, capKb),
    show_if: conditionOf(rows, i, ops),
  };
}

function settingsOf(row: Row, kinds: FormKindOption[], capKb: number): FormFieldSettings | null {
  if (row.kind === "number") {
    const min = numberOr(row.min);
    const max = numberOr(row.max);
    return min === null && max === null ? null : { min, max };
  }
  if (row.kind === "date") {
    const min = dateLimit(row.min);
    const max = dateLimit(row.max);
    return min === null && max === null ? null : { min, max };
  }
  if (row.kind === "hidden") return { value: row.value };
  if (isFileKind(kinds, row.kind)) return { accept: row.accept, max_kb: clampKb(row.maxMb, capKb) };

  return null;
}

function conditionOf(rows: Row[], i: number, ops: ConditionOp[]): FormShowIf | null {
  const row = rows[i];
  const c = row.condition;
  if (!c || !canCarryCondition(row.kind)) return null;

  // The source's name as it stands now — which is what makes a rename free.
  const source = rows.find((r) => r.key === c.sourceKey);
  const needsValue = ops.find((o) => o.value === c.op)?.needs_value ?? true;

  return { field: source ? source.name : c.field, op: c.op, ...(needsValue ? { value: c.value } : {}) };
}

/** `fields.N.sub` → the row that was at N when the refusal arrived, first message each. */
function pinErrors(errors: Record<string, string[]> | undefined, rows: Row[]): Record<string, Record<string, string>> {
  const byRow: Record<string, Record<string, string>> = {};

  for (const [key, messages] of Object.entries(errors ?? {})) {
    const match = /^fields\.(\d+)\.(.+)$/.exec(key);
    const row = match ? rows[Number(match[1])] : undefined;
    if (!match || !row || !messages?.[0]) continue;
    (byRow[row.key] ??= {})[match[2]] = messages[0];
  }

  return byRow;
}

function numberOr(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function dateLimit(text: string): string | null {
  return text === "today" || /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/** The size limit as posted: the typed megabytes in KB, inside the API's bounds and the server's cap. */
function clampKb(mb: string, capKb: number): number {
  const typed = Number(mb);
  const kb = Number.isFinite(typed) && typed > 0 ? Math.round(typed * 1024) : FILE_DEFAULT_KB;
  return Math.max(FILE_MIN_KB, Math.min(capKb, kb));
}

/** KB as the megabytes somebody types: 5120 → "5", 1536 → "1.5". */
function megabytes(kb: number): string {
  return String(Math.round((kb / 1024) * 100) / 100);
}

/** Today in the editor's own timezone, as a date input wants it. */
function todayLocal(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The first `prefix`+number that none of `keys` already is. Pure, so it is safe inside a state updater. */
function unusedKey(keys: string[], prefix: string): string {
  let n = keys.length + 1;
  while (keys.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * A key typed by hand: the same alphabet, but a trailing underscore is left
 * alone — stripped as it is typed, "first_name" could never be typed at all.
 */
function keyTyped(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "").slice(0, 60);
}

/** The API's rule, applied as you type rather than reported back as a 422. */
function keyFrom(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+/, "").replace(/_+$/, "").slice(0, 60);
}
