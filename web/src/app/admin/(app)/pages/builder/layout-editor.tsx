"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { EditorField } from "@/components/admin/editor-field";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LayoutField, LayoutOptions, LayoutWidgetSpec } from "@/types/api";
import {
  Choice, IconPick, ImagePath, NumberChoice, Repeater, Text, Toggle, VideoPath, getIn, useBlock, type Json, type Path,
} from "../../blocks/editors/shared";

/**
 * The custom layout section's editor (0.147.0, `docs/page-builder.md` "The
 * layout section"): rows, the columns in each, the widgets in each column.
 *
 * **It lists nothing of its own.** The widgets, every field of each, the row
 * and column settings and the limits all arrive in `options.layout`
 * (`LayoutRules::options()`), and the controls are drawn from those
 * descriptors — so a field added to the API is editable here with no change
 * to this file, and the same table validates it.
 *
 * **Everything is bound by path** (`rows.1.columns.0.widgets.2.text`), like
 * every section editor, so history, copy and paste and a 422 keyed the same
 * way all work. A structural change — add, remove, move, duplicate, change a
 * row's column count — is one `set` of `rows`, because each `set` starts from
 * the same snapshot and two in a row would lose the first (the comparison
 * editor's rule).
 *
 * **Rows and widgets carry a short id** (8 base-36 characters) the React keys
 * use, not the index: a rich-text editor reads its value once, so a reordered
 * list keyed by position would show one widget's words in another's box. A
 * duplicate gets fresh ids. Reordering is arrows and selects — HTML drag does
 * not fire on a touch screen, and nested lists are where it would go wrong.
 *
 * **Summernote is mounted only for an open text widget**, keyed on the
 * widget's id and the builder's `epoch`; fifteen editors on one form would be
 * slow and cluttered.
 */

/** The published records a form, slider or gallery widget can choose between (`GET /admin/pages/builder`). */
type Records = { id: number; name: string }[];
type EditorOptions = { layout?: LayoutOptions; forms?: Records; sliders?: Records; galleries?: Records };

/** Where each `ref` field's record is made when there is none to choose yet. */
const RECORD_LISTS = {
  form: { key: "forms", href: "/admin/forms/new" },
  slider: { key: "sliders", href: "/admin/sliders/new" },
  gallery: { key: "galleries", href: "/admin/galleries/new" },
} as const;

type Widget = { id: string; type: string; show_on?: string[]; [key: string]: unknown };
type Column = { widgets?: Widget[]; [key: string]: unknown };
type LayoutRow = { id: string; columns?: Column[]; [key: string]: unknown };

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A short random id that is not already in `taken`. */
export function mintId(taken: Set<string>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const id = Array.from(bytes, (b) => ALPHABET[b % 36]).join("");
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

/** What a new layout section starts with: one row of two empty columns. */
export function blankLayout(): Record<string, unknown> {
  return { rows: [{ id: mintId(new Set()), columns: [{ widgets: [] }, { widgets: [] }] }] };
}

/** A one-line reminder of what a collapsed layout section holds. */
export function layoutSummary(data: Record<string, unknown>): string {
  const rows = Array.isArray(data.rows) ? (data.rows as LayoutRow[]) : [];
  if (!rows.length || !Array.isArray(rows[0]?.columns)) return "";
  const widgets = rows.reduce((n, r) => n + (r.columns ?? []).reduce((m, c) => m + (c.widgets?.length ?? 0), 0), 0);
  return `${rows.length} row${rows.length === 1 ? "" : "s"}, ${widgets} widget${widgets === 1 ? "" : "s"}`;
}

const DEVICES = [{ value: "phone", label: "Phone" }, { value: "tablet", label: "Tablet" }, { value: "desktop", label: "Computer" }];

type Ctx = {
  spec: LayoutOptions;
  rows: LayoutRow[];
  write: (next: LayoutRow[]) => void;
  /** Whether a card is open: an error under it, a press, or `initial` (a row starts open, a widget closed). */
  isOpen: (key: string, path: Path, initial?: boolean) => boolean;
  toggle: (key: string, path: Path, initial?: boolean) => void;
  sectionId: string;
  options: EditorOptions;
  widgets: number;
  taken: () => Set<string>;
};
const LayoutCtx = createContext<Ctx | null>(null);
function useLayout(): Ctx {
  const ctx = useContext(LayoutCtx);
  if (!ctx) throw new Error("useLayout outside LayoutEditor");
  return ctx;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A copy of a row with every row and widget id replaced, so the section's ids stay unique. */
function freshRow(row: LayoutRow, taken: Set<string>): LayoutRow {
  const copy = clone(row);
  copy.id = mintId(taken);
  for (const column of copy.columns ?? []) for (const widget of column.widgets ?? []) widget.id = mintId(taken);
  return copy;
}

function swap<T>(list: T[], from: number, delta: -1 | 1): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(from + delta, 0, item);
  return next;
}

export function LayoutEditor({ sectionId, options }: { sectionId: string; options: EditorOptions }) {
  const { content, set, setStep, anyErr } = useBlock();
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const spec = options.layout;

  if (!spec) {
    return <p className="text-13-5 text-muted">This server does not offer custom layouts yet. Update the API, then reload.</p>;
  }

  const rows = Array.isArray(content.rows) ? (content.rows as unknown as LayoutRow[]) : [];
  const widgetCount = rows.reduce((n, r) => n + (r.columns ?? []).reduce((m, c) => m + (c.widgets?.length ?? 0), 0), 0);
  const ids = () => {
    const taken = new Set<string>();
    for (const r of rows) {
      taken.add(r.id);
      for (const c of r.columns ?? []) for (const w of c.widgets ?? []) taken.add(w.id);
    }
    return taken;
  };
  // A structural change is an undo step of its own (`setStep`), never merged with typing.
  const write = (next: LayoutRow[]) => (setStep ?? set)(["rows"], next as unknown as Json);

  const ctx: Ctx = {
    spec,
    rows,
    write,
    // A card with an error under it is open whatever was clicked, so a 422 is never hidden.
    isOpen: (key, path, initial = false) => (anyErr ? anyErr(path) : false) || (openMap[key] ?? initial),
    toggle: (key, path, initial = false) => setOpenMap((m) => ({ ...m, [key]: !(m[key] ?? ((anyErr ? anyErr(path) : false) || initial)) })),
    sectionId,
    options,
    widgets: widgetCount,
    taken: ids,
  };

  const addRow = (columns: number) => {
    const taken = ids();
    write([...rows, { id: mintId(taken), columns: Array.from({ length: columns }, () => ({ widgets: [] })) }]);
  };
  const full = rows.length >= spec.limits.rows;

  return (
    <LayoutCtx.Provider value={ctx}>
      <Text path={["kicker"]} label="Kicker" />
      <Text path={["heading"]} label="Heading" hint="Optional. With one, the headings below it are a level lower." />
      <Text path={["lede"]} label="Lede" multiline />

      <fieldset className="mb-4">
        <legend className="mb-1 text-14 font-semibold">Rows</legend>
        <p className="mb-3 text-12-5 text-faint">
          {rows.length} of {spec.limits.rows} rows, {widgetCount} of {spec.limits.widgets} widgets. Each row has up to {spec.limits.columns} columns;
          columns stack one above the other on a phone.
        </p>
        <ol className="grid gap-4">
          {rows.map((row, r) => <RowCard key={row.id} row={row} index={r} />)}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-13 font-semibold">Add a row of</span>
          {Array.from({ length: spec.limits.columns }, (_, i) => i + 1).map((n) => (
            <Button key={n} type="button" size="sm" variant="secondary" disabled={full} onClick={() => addRow(n)}>
              {n} column{n === 1 ? "" : "s"}
            </Button>
          ))}
        </div>
      </fieldset>
    </LayoutCtx.Provider>
  );
}

/** A choice from a descriptor, as a select labelled by it. */
function SettingChoice({ field, path }: { field: LayoutField; path: Path }) {
  return (
    <Choice path={path} label={field.label} hint={field.hint ?? undefined} fallback={field.default} options={field.choices ?? []} />
  );
}

function RowCard({ row, index }: { row: LayoutRow; index: number }) {
  const { spec, rows, write, isOpen, toggle, taken } = useLayout();
  const path: Path = ["rows", index];
  const key = row.id;
  const open = isOpen(key, path, true);
  const columns = row.columns ?? [];
  const count = columns.length;
  const fields = spec.row.filter((f) => (f.key === "split" || f.key === "reverse_stacked" ? count === 2 : true));

  const replace = (next: LayoutRow) => write(rows.map((r, i) => (i === index ? next : r)));

  // One write for a new column count. Fewer columns hand the dropped ones'
  // widgets to the last column kept; a split and a stacking order mean
  // nothing outside two columns, so they go with it.
  const setCount = (n: number) => {
    let next = columns.slice(0, n);
    if (n > count) next = [...columns, ...Array.from({ length: n - count }, () => ({ widgets: [] }))];
    else if (n < count) {
      const dropped = columns.slice(n).flatMap((c) => c.widgets ?? []);
      next = next.map((c, i) => (i === n - 1 ? { ...c, widgets: [...(c.widgets ?? []), ...dropped] } : c));
    }
    const nextRow: LayoutRow = { ...row, columns: next };
    if (n !== 2) {
      delete nextRow.split;
      delete nextRow.reverse_stacked;
    }
    replace(nextRow);
  };

  const widgetCount = columns.reduce((m, c) => m + (c.widgets?.length ?? 0), 0);

  return (
    <li data-layout-row-card={row.id} className="min-w-0 rounded-lg border border-line-strong bg-card">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => toggle(key, path, true)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded py-1 text-left"
        >
          <span aria-hidden className={cn("text-faint transition-[rotate] duration-(--duration-base)", open ? "rotate-90" : "rotate-0")}>▸</span>
          <span className="shrink-0 text-14 font-semibold">Row {index + 1}</span>
          <span className="min-w-0 truncate text-13 text-muted">— {count} column{count === 1 ? "" : "s"}, {widgetCount} widget{widgetCount === 1 ? "" : "s"}</span>
        </button>
        <ReorderButtons
          index={index}
          count={rows.length}
          subject={`row ${index + 1}`}
          onMove={(d) => write(swap(rows, index, d))}
          onRemove={rows.length > 1 ? () => write(rows.filter((_, i) => i !== index)) : undefined}
          dense
        >
          {rows.length < spec.limits.rows && (
            <button
              type="button"
              onClick={() => { const copy = freshRow(row, taken()); const next = [...rows]; next.splice(index + 1, 0, copy); write(next); }}
              className="grid size-6 place-items-center rounded text-13 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <span aria-hidden>⧉</span><span className="sr-only">Duplicate row {index + 1}</span>
            </button>
          )}
        </ReorderButtons>
      </div>

      {open && (
        <div className="border-t border-line p-4">
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Columns" htmlFor={`${key}-count`} variant="float-static">
              <Select id={`${key}-count`} value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
                {Array.from({ length: spec.limits.columns }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </Field>
            {fields.map((f) => (
              f.kind === "bool"
                ? <Toggle key={f.key} path={[...path, f.key]} label={f.label} />
                : <SettingChoice key={f.key} field={f} path={[...path, f.key]} />
            ))}
          </div>
          <div className={cn("mt-2 grid min-w-0 gap-3", count > 1 && "md:grid-cols-2")}>
            {columns.map((column, c) => <ColumnCard key={c} column={column} row={index} index={c} />)}
          </div>
        </div>
      )}
    </li>
  );
}

function ColumnCard({ column, row, index }: { column: Column; row: number; index: number }) {
  const { spec, rows, write, taken, widgets: total } = useLayout();
  const path: Path = ["rows", row, "columns", index];
  const widgets = column.widgets ?? [];
  const surface = typeof column.surface === "string" ? column.surface : "none";
  const fields = spec.column.filter((f) => (f.key === "pad" ? surface !== "none" : true));

  const replaceWidgets = (next: Widget[]) => {
    const nextRows = rows.map((r, i) => (i !== row ? r : { ...r, columns: (r.columns ?? []).map((c, j) => (j === index ? { ...c, widgets: next } : c)) }));
    write(nextRows);
  };

  const add = (spec: LayoutWidgetSpec) => {
    const blank: Widget = { id: mintId(taken()), type: spec.value };
    if (spec.list) blank[spec.list.key] = Array.from({ length: spec.list.min }, () => ({}));
    replaceWidgets([...widgets, blank]);
  };

  const canAdd = widgets.length < spec.limits.widgets_per_column && total < spec.limits.widgets;

  // A slider or a gallery carries its own autoplay and Pause control, so a section holds one of each: no second to add or copy.
  const singles = new Set(spec.widgets.filter((w) => w.fields.some((f) => f.single)).map((w) => w.value));
  const placed = new Set(rows.flatMap((r) => (r.columns ?? []).flatMap((c) => (c.widgets ?? []).map((w) => w.type))));

  // Every column in the section, as a place to send a widget.
  const targets = rows.flatMap((r, i) => (r.columns ?? []).map((_, j) => ({ value: `${i}.${j}`, label: `Row ${i + 1}, column ${j + 1}` })));
  const moveTo = (w: number, target: string) => {
    const [tr, tc] = target.split(".").map(Number);
    if (tr === row && tc === index) return;
    const widget = widgets[w];
    const nextRows = rows.map((r, i) => ({
      ...r,
      columns: (r.columns ?? []).map((c, j) => {
        if (i === row && j === index) return { ...c, widgets: widgets.filter((_, k) => k !== w) };
        if (i === tr && j === tc) return { ...c, widgets: [...(c.widgets ?? []), widget] };
        return c;
      }),
    }));
    write(nextRows);
  };

  return (
    <div data-layout-col-card className="min-w-0 rounded-lg border border-line bg-surface p-3">
      <p className="mb-2 text-12 font-semibold uppercase tracking-[.06em] text-faint">Column {index + 1}</p>
      <div className="grid gap-x-3 sm:grid-cols-2">
        {fields.map((f) => <SettingChoice key={f.key} field={f} path={[...path, f.key]} />)}
      </div>

      <ol className="grid gap-2">
        {widgets.map((widget, w) => (
          <WidgetCard
            key={widget.id}
            widget={widget}
            path={[...path, "widgets", w]}
            index={w}
            count={widgets.length}
            targets={targets}
            here={`${row}.${index}`}
            onMove={(d) => replaceWidgets(swap(widgets, w, d))}
            onRemove={() => replaceWidgets(widgets.filter((_, k) => k !== w))}
            onDuplicate={canAdd && !singles.has(widget.type) ? () => { const copy = clone(widget); copy.id = mintId(taken()); const next = [...widgets]; next.splice(w + 1, 0, copy); replaceWidgets(next); } : undefined}
            onMoveTo={(target) => moveTo(w, target)}
          />
        ))}
      </ol>
      {widgets.length === 0 && <p className="mb-2 text-12-5 text-faint">Nothing here yet.</p>}

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Add a widget to column ${index + 1}`}>
        {spec.widgets.map((w) => (
          <Button key={w.value} type="button" size="sm" variant="secondary" disabled={!canAdd || (singles.has(w.value) && placed.has(w.value))} onClick={() => add(w)} title={singles.has(w.value) && placed.has(w.value) ? `A layout section holds one ${w.label.toLowerCase()}.` : w.blurb}>
            + {w.label}
          </Button>
        ))}
      </div>
      {!canAdd && <p className="mt-1.5 text-12-5 text-faint">A column holds {spec.limits.widgets_per_column} widgets and a layout {spec.limits.widgets}.</p>}
    </div>
  );
}

/** A widget's own words, as the collapsed card's reminder of it. */
function snippet(widget: Widget): string {
  for (const key of ["text", "label", "title", "caption"]) {
    const v = widget[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (typeof widget.html === "string") return widget.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const first = Array.isArray(widget.items) ? (widget.items[0] as { question?: string; text?: string } | undefined) : undefined;
  return first?.question ?? first?.text ?? "";
}

function WidgetCard({ widget, path, index, count, targets, here, onMove, onRemove, onDuplicate, onMoveTo }: {
  widget: Widget;
  path: Path;
  index: number;
  count: number;
  targets: { value: string; label: string }[];
  here: string;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  onMoveTo: (target: string) => void;
}) {
  const { spec, isOpen, toggle } = useLayout();
  const info = spec.widgets.find((w) => w.value === widget.type);
  const open = isOpen(widget.id, path);
  const text = snippet(widget);
  const moveId = `${widget.id}-move`;

  return (
    <li data-layout-widget-card={widget.type} className="min-w-0 rounded-lg border border-line-strong bg-card">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => toggle(widget.id, path)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left"
        >
          <span aria-hidden className={cn("text-faint transition-[rotate] duration-(--duration-base)", open ? "rotate-90" : "rotate-0")}>▸</span>
          <span className="shrink-0 text-13-5 font-semibold">{info?.label ?? widget.type}</span>
          {text && <span className="min-w-0 truncate text-13 text-muted">— {text}</span>}
        </button>
        {Array.isArray(widget.show_on) && widget.show_on.length < 3 && <Badge tone="closed">Some screens</Badge>}
        <ReorderButtons index={index} count={count} subject={`${info?.label.toLowerCase() ?? "widget"} ${index + 1}`} onMove={onMove} onRemove={onRemove} dense>
          {onDuplicate && (
            <button type="button" onClick={onDuplicate} className="grid size-6 place-items-center rounded text-13 text-muted hover:bg-surface-2 hover:text-ink">
              <span aria-hidden>⧉</span><span className="sr-only">Duplicate this widget</span>
            </button>
          )}
        </ReorderButtons>
      </div>

      {open && info && (
        <div className="border-t border-line p-3">
          <WidgetFields widget={widget} info={info} path={path} />
          <DevicesField path={[...path, "show_on"]} />
          {targets.length > 1 && (
            <Field label="Move to" htmlFor={moveId} variant="float-static">
              <Select id={moveId} value={here} onChange={(e) => onMoveTo(e.target.value)}>
                {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}
    </li>
  );
}

/** Whether a conditional field applies: every `when` entry holds, a sibling left unset counting as its default. */
function applies(field: LayoutField, widget: Widget, fields: LayoutField[]): boolean {
  return Object.entries(field.when ?? {}).every(([sibling, wanted]) => {
    const have = widget[sibling] ?? fields.find((f) => f.key === sibling)?.default;
    return have === wanted;
  });
}

function WidgetFields({ widget, info, path }: { widget: Widget; info: LayoutWidgetSpec; path: Path }) {
  const shown = info.fields.filter((f) => applies(f, widget, info.fields));
  // A choice another field depends on (a video's "where it is") comes first, on its own line: what is drawn below it changes with it.
  const drivers = new Set(info.fields.flatMap((f) => Object.keys(f.when ?? {})));
  const driving = shown.filter((f) => drivers.has(f.key));
  const rest = shown.filter((f) => !drivers.has(f.key));
  const lines = rest.filter((f) => f.kind !== "bool" && f.kind !== "choice");
  const choices = rest.filter((f) => f.kind === "choice");
  const bools = rest.filter((f) => f.kind === "bool");

  return (
    <>
      {driving.map((f) => <FieldInput key={f.key} field={f} path={[...path, f.key]} widgetId={widget.id} />)}
      {lines.map((f) => <FieldInput key={f.key} field={f} path={[...path, f.key]} widgetId={widget.id} />)}
      {choices.length > 0 && (
        <div className="grid gap-x-3 sm:grid-cols-2">
          {choices.map((f) => <SettingChoice key={f.key} field={f} path={[...path, f.key]} />)}
        </div>
      )}
      {bools.map((f) => <Toggle key={f.key} path={[...path, f.key]} label={f.label} />)}
      {info.list && (
        <Repeater
          path={[...path, info.list.key]}
          label={`${info.list.label}s`}
          subject={info.list.label}
          min={info.list.min}
          max={info.list.max}
          blank={() => ({})}
          row={(p) => (
            <>
              {info.list!.fields.map((f) => <FieldInput key={f.key} field={f} path={[...p, f.key]} widgetId={widget.id} />)}
            </>
          )}
        />
      )}
    </>
  );
}

/** One descriptor drawn with the editor primitives. */
function FieldInput({ field, path, widgetId }: { field: LayoutField; path: Path; widgetId: string }): ReactNode {
  switch (field.kind) {
    case "html": return <HtmlInput field={field} path={path} widgetId={widgetId} />;
    case "path": return <ImagePath path={path} label={field.label} />;
    case "video": return <VideoPath path={path} label={field.label} />;
    case "youtube": return <Text path={path} label={field.label} placeholder="https://www.youtube.com/watch?v=…" required={field.required} hint="A watch, share or embed link. Nothing is loaded from YouTube until a visitor presses play." />;
    case "ref": return <RecordPick field={field} path={path} />;
    case "icon": return <IconPick path={path} label={field.label} />;
    case "link": return <Text path={path} label={field.label} placeholder="/contact" required={field.required} />;
    case "choice": return <SettingChoice field={field} path={path} />;
    case "bool": return <Toggle path={path} label={field.label} />;
    default: return <Text path={path} label={field.label} multiline={field.multiline} required={field.required} />;
  }
}

/** A published form, slider or gallery, chosen by name; the API stores its id. */
function RecordPick({ field, path }: { field: LayoutField; path: Path }) {
  const { options } = useLayout();
  const list = field.record ? RECORD_LISTS[field.record] : null;
  const records = list ? options[list.key] ?? [] : [];

  if (!list || !records.length) {
    return (
      <p className="mb-[18px] rounded border border-dashed border-line-strong bg-surface px-4 py-3 text-13-5 text-muted">
        There is no published {field.record ?? "record"} yet.{" "}
        {list && <Link href={list.href} className="font-semibold text-brand-ink underline">Make one</Link>}.
      </p>
    );
  }

  return (
    <NumberChoice
      path={path}
      label={field.label}
      placeholder="Choose…"
      options={records.map((r) => ({ value: String(r.id), label: r.name }))}
      hint={field.single ? "A layout section holds one of these." : undefined}
    />
  );
}

/** The rich-text editor of one text widget: mounted only while its card is open, keyed on the widget and the history epoch. */
function HtmlInput({ field, path, widgetId }: { field: LayoutField; path: Path; widgetId: string }) {
  const { content, set, err, epoch } = useBlock();
  const { sectionId } = useLayout();
  const value = getIn(content as Json, path);

  return (
    <EditorField
      key={`${widgetId}-${epoch ?? 0}`}
      name={`_sb_${sectionId}_${widgetId}`}
      label={field.label}
      defaultValue={typeof value === "string" ? value : ""}
      error={err(path)}
      hint="Shortcodes work here, as in any page body."
      onChange={(html) => set(path, html || undefined)}
    />
  );
}

/** Which screens a widget shows on. All three is the default and stores nothing. */
function DevicesField({ path }: { path: Path }) {
  const { content, set, idPrefix } = useBlock();
  const raw = getIn(content as Json, path);
  const shown = Array.isArray(raw) ? (raw as string[]) : DEVICES.map((d) => d.value);

  const toggle = (device: string) => {
    const has = shown.includes(device);
    // The last device cannot be switched off: hiding a widget everywhere is Remove's job.
    if (has && shown.length === 1) return;
    const next = DEVICES.map((d) => d.value).filter((d) => (d === device ? !has : shown.includes(d)));
    set(path, next.length === DEVICES.length ? undefined : next);
  };

  return (
    <fieldset className="mb-[18px]">
      <legend className="mb-1.5 text-13-5 font-semibold">Show on</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {DEVICES.map((d) => (
          <label key={d.value} htmlFor={`${idPrefix ?? "b"}-${path.join("-")}-${d.value}`} className="inline-flex min-h-6 cursor-pointer items-center gap-2 text-13-5">
            <input
              id={`${idPrefix ?? "b"}-${path.join("-")}-${d.value}`}
              type="checkbox"
              className="size-4 accent-brand-600"
              checked={shown.includes(d.value)}
              onChange={() => toggle(d.value)}
            />
            {d.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
