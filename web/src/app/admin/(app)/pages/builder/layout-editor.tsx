"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { EditorField } from "@/components/admin/editor-field";
import { reinsert, useDragReorder, type DragSpot } from "@/lib/hooks/use-drag-reorder";
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
 * duplicate gets fresh ids. Reordering is arrows and selects everywhere, and
 * (0.155.0) a grip on each row and widget for a mouse — see below.
 *
 * **Summernote is mounted only for an open text widget**, keyed on the
 * widget's id and the builder's `epoch`; fifteen editors on one form would be
 * slow and cluttered.
 *
 * **Containers (0.154.0)** — a box, tabs, panels or columns inside a column —
 * draw their `slots` (`SlotsEditor`), and each slot is a `WidgetList`, the
 * very component a column uses, limited to the API's `child_types`. A list is
 * written by key (`updateList`): a column by position, a slot by its id, so a
 * move that first takes a widget out of the list ahead of a container still
 * lands in the container. "Move to" lists every column and every slot a
 * widget may go to; a container is offered columns only.
 *
 * **Drag (0.155.0)** is `useDragReorder`, one instance for the whole editor:
 * every list is a scope (`rows`, a column's key, a slot's key), so a widget
 * can be dropped in its own column, in another row's column, or into and out
 * of a container's slot. The rules live in `accepts`: rows go among rows and
 * widgets among widgets; a container never goes into a slot, a slot takes
 * only the container's `child_types` (the API's descriptor), and a column or
 * slot already at `widgets_per_column` takes nothing more. A refused target
 * draws no line and takes no drop. Each drop is one `write`, so one undo
 * step. The grips are hidden below `sm` — touch fires no HTML drag events —
 * and the arrows and "Move to" are untouched, so the keyboard loses nothing.
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
/** One tab, panel or column of a container widget (0.154.0); it holds ordinary widgets. */
type Slot = { id: string; widgets?: Widget[]; [key: string]: unknown };
/** A place a widget can be sent: a column, or a container's slot (`slot`), by the key `updateList` reads. */
type Target = { value: string; label: string; slot: boolean };
/** What is held in a drag: a row (scope `rows`) or a widget (any other scope). */
type Held = LayoutRow | Widget;
type Dnd = ReturnType<typeof useDragReorder<Held>>;

const ROWS = "rows";

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
  const widgets = countWidgets(rows);
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
  /** Every column and slot, for a widget's "Move to". */
  targets: Target[];
  dnd: Dnd;
};
const LayoutCtx = createContext<Ctx | null>(null);
function useLayout(): Ctx {
  const ctx = useContext(LayoutCtx);
  if (!ctx) throw new Error("useLayout outside LayoutEditor");
  return ctx;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A copy of a widget with its id — and a container's slot and child ids — replaced, so the section's ids stay unique. */
function freshWidget(widget: Widget, taken: Set<string>): Widget {
  const copy = clone(widget);
  copy.id = mintId(taken);
  if (Array.isArray(copy.slots)) {
    for (const slot of copy.slots as Slot[]) {
      slot.id = mintId(taken);
      for (const child of slot.widgets ?? []) child.id = mintId(taken);
    }
  }
  return copy;
}

/** A copy of a row with every row and widget id replaced, so the section's ids stay unique. */
function freshRow(row: LayoutRow, taken: Set<string>): LayoutRow {
  const copy = clone(row);
  copy.id = mintId(taken);
  for (const column of copy.columns ?? []) column.widgets = (column.widgets ?? []).map((widget) => freshWidget(widget, taken));
  return copy;
}

/** Widgets in the section, a container's children counted as the API counts them. */
function countWidgets(rows: LayoutRow[]): number {
  let n = 0;
  for (const r of rows) {
    for (const c of r.columns ?? []) {
      for (const w of c.widgets ?? []) {
        n += 1;
        if (Array.isArray(w.slots)) for (const slot of w.slots as Slot[]) n += slot.widgets?.length ?? 0;
      }
    }
  }
  return n;
}

const columnKey = (row: number, column: number) => `c:${row}.${column}`;
const slotKey = (id: string) => `s:${id}`;

/**
 * The rows with one list of widgets replaced: a column's (`c:row.column`) or
 * a container slot's (`s:<slot id>`). A slot is found by its id, not its
 * position, so a write that first removes a widget from the list before it
 * still lands in the right place.
 */
function updateList(rows: LayoutRow[], key: string, fn: (list: Widget[]) => Widget[]): LayoutRow[] {
  return rows.map((row, i) => ({
    ...row,
    columns: (row.columns ?? []).map((column, j) => {
      if (key === columnKey(i, j)) return { ...column, widgets: fn(column.widgets ?? []) };
      return {
        ...column,
        widgets: (column.widgets ?? []).map((w) => (!Array.isArray(w.slots)
          ? w
          : { ...w, slots: (w.slots as Slot[]).map((slot) => (key === slotKey(slot.id) ? { ...slot, widgets: fn(slot.widgets ?? []) } : slot)) })),
      };
    }),
  }));
}

/** The widgets of one list, by the key `updateList` reads. */
function listOf(rows: LayoutRow[], key: string): Widget[] {
  let found: Widget[] = [];
  updateList(rows, key, (list) => { found = list; return list; });
  return found;
}

/** The container widget a slot belongs to. */
function slotOwner(rows: LayoutRow[], slotId: string): Widget | undefined {
  for (const r of rows) for (const c of r.columns ?? []) for (const w of c.widgets ?? []) {
    if (Array.isArray(w.slots) && (w.slots as Slot[]).some((s) => s.id === slotId)) return w;
  }
  return undefined;
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
  const rows = Array.isArray(content.rows) ? (content.rows as unknown as LayoutRow[]) : [];
  // A structural change is an undo step of its own (`setStep`), never merged with typing.
  const write = (next: LayoutRow[]) => (setStep ?? set)(["rows"], next as unknown as Json);

  const dnd = useDragReorder<Held>({
    accepts: (source, target, item) => {
      if (!spec) return false;
      if (source === ROWS || target === ROWS) return source === target;
      if (target.startsWith("s:")) {
        const widget = item as Widget;
        const owner = slotOwner(rows, target.slice(2));
        const box = spec.widgets.find((w) => w.value === owner?.type)?.container;
        if (!box || spec.widgets.find((w) => w.value === widget.type)?.container || !box.child_types.includes(widget.type)) return false;
      }
      return source === target || listOf(rows, target).length < spec.limits.widgets_per_column;
    },
    onMove: (from: DragSpot, to: DragSpot, item: Held) => {
      if (from.scope === ROWS) return write(reinsert(rows, from.index, to.index));
      if (from.scope === to.scope) return write(updateList(rows, from.scope, (list) => reinsert(list, from.index, to.index)));
      const widget = item as Widget;
      // Out of one list, into the other — one write, the target found by key after the removal.
      write(updateList(updateList(rows, from.scope, (list) => list.filter((w) => w.id !== widget.id)), to.scope, (list) => {
        const next = [...list];
        next.splice(to.index, 0, widget);
        return next;
      }));
    },
  });

  if (!spec) {
    return <p className="text-13-5 text-muted">This server does not offer custom layouts yet. Update the API, then reload.</p>;
  }

  const widgetCount = countWidgets(rows);
  const ids = () => {
    const taken = new Set<string>();
    for (const r of rows) {
      taken.add(r.id);
      for (const c of r.columns ?? []) {
        for (const w of c.widgets ?? []) {
          taken.add(w.id);
          if (Array.isArray(w.slots)) for (const slot of w.slots as Slot[]) { taken.add(slot.id); for (const child of slot.widgets ?? []) taken.add(child.id); }
        }
      }
    }
    return taken;
  };
  // Every column, and every slot of every container, as a place to send a widget.
  const targets: Target[] = rows.flatMap((r, i) => (r.columns ?? []).flatMap((c, j) => {
    const where = `Row ${i + 1}, column ${j + 1}`;
    const inside = (c.widgets ?? []).flatMap((w) => {
      const info = spec.widgets.find((x) => x.value === w.type);
      if (!info?.container || !Array.isArray(w.slots)) return [];
      return (w.slots as Slot[]).map((slot, n) => ({
        value: slotKey(slot.id),
        label: `${where} › ${info.label}: ${String(slot.label ?? slot.title ?? "") || `${info.container!.label} ${n + 1}`}`,
        slot: true,
      }));
    });
    return [{ value: columnKey(i, j), label: where, slot: false }, ...inside];
  }));

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
    targets,
    dnd,
  };

  const addRow = (columns: number) => {
    const taken = ids();
    write([...rows, { id: mintId(taken), columns: Array.from({ length: columns }, () => ({ widgets: [] })) }]);
  };
  const full = rows.length >= spec.limits.rows;

  return (
    <LayoutCtx.Provider value={ctx}>
      <div {...dnd.root}>
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
      </div>
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
  const { spec, rows, write, isOpen, toggle, taken, dnd } = useLayout();
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
    <li
      data-layout-row-card={row.id}
      {...dnd.target(ROWS, index)}
      className={cn("relative min-w-0 rounded-lg border border-line-strong bg-card", dnd.dragging(ROWS, index) && "opacity-50")}
    >
      <DropLine above={dnd.line(ROWS, index)} below={index === rows.length - 1 && dnd.line(ROWS, rows.length)} gap="-0.625rem" />
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Grip props={dnd.handle(ROWS, index, row)} label={`row ${index + 1}`} />
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

/** The grip a mouse drags by; hidden below `sm`, where touch fires no drag events and the arrows do the job. */
function Grip({ props, label }: { props: ReturnType<Dnd["handle"]>; label: string }) {
  return (
    <span
      {...props}
      data-layout-grip
      title={`Drag ${label} to move it`}
      aria-hidden
      className="hidden cursor-grab touch-none select-none rounded px-1 text-16 leading-none text-faint hover:bg-surface-2 hover:text-ink active:cursor-grabbing sm:block"
    >
      ⠿
    </span>
  );
}

/** Where a dragged row or widget would land: a line in the gap above or below the item (`gap` is half the list's gap). */
function DropLine({ above, below, gap }: { above: boolean; below: boolean; gap: string }) {
  return (
    <>
      {above && <span aria-hidden data-layout-drop-line className="absolute inset-x-2 h-1 rounded-full bg-brand-500" style={{ top: gap }} />}
      {below && <span aria-hidden data-layout-drop-line className="absolute inset-x-2 h-1 rounded-full bg-brand-500" style={{ bottom: gap }} />}
    </>
  );
}

function ColumnCard({ column, row, index }: { column: Column; row: number; index: number }) {
  const { spec, write, rows } = useLayout();
  const path: Path = ["rows", row, "columns", index];
  const surface = typeof column.surface === "string" ? column.surface : "none";
  const fields = spec.column.filter((f) => (f.key === "pad" ? surface !== "none" : true));

  return (
    <div data-layout-col-card className="min-w-0 rounded-lg border border-line bg-surface p-3">
      <p className="mb-2 text-12 font-semibold uppercase tracking-[.06em] text-faint">Column {index + 1}</p>
      <div className="grid gap-x-3 sm:grid-cols-2">
        {fields.map((f) => <SettingChoice key={f.key} field={f} path={[...path, f.key]} />)}
      </div>
      <WidgetList
        listKey={columnKey(row, index)}
        base={[...path, "widgets"]}
        widgets={column.widgets ?? []}
        allowed={null}
        subject={`column ${index + 1}`}
        onChange={(next) => write(updateList(rows, columnKey(row, index), () => next))}
      />
    </div>
  );
}

/**
 * One list of widgets and the buttons that add to it: a column's (every kind
 * may go in) or a container slot's (`allowed` is the API's `child_types` — no
 * container, form, slider or gallery). The same component draws both, so a
 * slot has every control a column has: add, move, move to, duplicate, remove.
 */
function WidgetList({ listKey, base, widgets, allowed, subject, onChange }: {
  listKey: string;
  base: Path;
  widgets: Widget[];
  allowed: string[] | null;
  subject: string;
  onChange: (next: Widget[]) => void;
}) {
  const { spec, rows, write, taken, widgets: total, targets, dnd } = useLayout();

  const add = (kind: LayoutWidgetSpec) => {
    const ids = taken();
    const blank: Widget = { id: mintId(ids), type: kind.value };
    if (kind.list) blank[kind.list.key] = Array.from({ length: kind.list.min }, () => ({}));
    if (kind.container) blank[kind.container.key] = blankSlots(kind.container, ids);
    onChange([...widgets, blank]);
  };

  const canAdd = widgets.length < spec.limits.widgets_per_column && total < spec.limits.widgets;
  const offered = allowed ? spec.widgets.filter((w) => allowed.includes(w.value)) : spec.widgets;

  // A slider or a gallery carries its own autoplay and Pause control, so a section holds one of each: no second to add or copy.
  const singles = new Set(spec.widgets.filter((w) => w.fields.some((f) => f.single)).map((w) => w.value));
  const placed = new Set(rows.flatMap((r) => (r.columns ?? []).flatMap((c) => (c.widgets ?? []).map((w) => w.type))));

  const moveTo = (id: string, target: string) => {
    if (target === listKey) return;
    const widget = widgets.find((w) => w.id === id);
    if (!widget) return;
    // Out of this list, into the target — one write, the target found by id after the removal.
    write(updateList(updateList(rows, listKey, (list) => list.filter((w) => w.id !== id)), target, (list) => [...list, widget]));
  };

  return (
    <div {...dnd.list(listKey, widgets.length)} data-layout-list={listKey}>
      <ol className="grid gap-2">
        {widgets.map((widget, w) => (
          <WidgetCard
            key={widget.id}
            listKey={listKey}
            widget={widget}
            path={[...base, w]}
            index={w}
            count={widgets.length}
            targets={targets.filter((t) => !t.slot || childTypes(spec).includes(widget.type))}
            here={listKey}
            onMove={(d) => onChange(swap(widgets, w, d))}
            onRemove={() => onChange(widgets.filter((_, k) => k !== w))}
            onDuplicate={canAdd && !singles.has(widget.type) ? () => { const copy = freshWidget(widget, taken()); const next = [...widgets]; next.splice(w + 1, 0, copy); onChange(next); } : undefined}
            onMoveTo={(target) => moveTo(widget.id, target)}
          />
        ))}
      </ol>
      {widgets.length === 0 && (
        <div className="relative">
          <DropLine above={dnd.line(listKey, 0)} below={false} gap="-0.25rem" />
          <p className="mb-2 text-12-5 text-faint">Nothing here yet.</p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Add a widget to ${subject}`}>
        {offered.map((w) => (
          <Button key={w.value} type="button" size="sm" variant="secondary" disabled={!canAdd || (singles.has(w.value) && placed.has(w.value))} onClick={() => add(w)} title={singles.has(w.value) && placed.has(w.value) ? `A layout section holds one ${w.label.toLowerCase()}.` : w.blurb}>
            + {w.label}
          </Button>
        ))}
      </div>
      {!canAdd && <p className="mt-1.5 text-12-5 text-faint">A column or slot holds {spec.limits.widgets_per_column} widgets and a layout {spec.limits.widgets}.</p>}
    </div>
  );
}

/** The widget types a container's slot may hold, from the API. */
function childTypes(spec: LayoutOptions): string[] {
  return spec.widgets.find((w) => w.container)?.container?.child_types ?? [];
}

/** A new container's slots, each with the required text fields it needs to save ("Tab 1", "Panel 2"). */
function blankSlots(box: NonNullable<LayoutWidgetSpec["container"]>, taken: Set<string>): Slot[] {
  return Array.from({ length: box.min }, (_, n) => slotWith(box, taken, n));
}

function slotWith(box: NonNullable<LayoutWidgetSpec["container"]>, taken: Set<string>, n: number): Slot {
  const slot: Slot = { id: mintId(taken), widgets: [] };
  for (const f of box.fields) if (f.kind === "text" && f.required) slot[f.key] = `${box.label} ${n + 1}`;
  return slot;
}

/**
 * A container's slots — the tabs, panels or columns it holds — each with its
 * own name and its own widget list. Add and remove only where the API's
 * `min`/`max` differ (a box has exactly one slot).
 */
function SlotsEditor({ widget, info, path }: { widget: Widget; info: LayoutWidgetSpec; path: Path }) {
  const { rows, write, taken } = useLayout();
  const box = info.container!;
  const slots = (Array.isArray(widget[box.key]) ? widget[box.key] : []) as Slot[];
  const fixed = box.min === box.max;

  const replace = (next: Slot[]) =>
    write(rows.map((r) => ({
      ...r,
      columns: (r.columns ?? []).map((c) => ({ ...c, widgets: (c.widgets ?? []).map((x) => (x.id === widget.id ? { ...x, [box.key]: next } : x)) })),
    })));

  return (
    <div className="mt-1">
      {slots.map((slot, s) => {
        const slotPath: Path = [...path, box.key, s];
        return (
          <div key={slot.id} data-layout-slot={slot.id} className="mb-3 min-w-0 rounded-lg border border-line bg-surface p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-12 font-semibold uppercase tracking-[.06em] text-faint">
                {box.label} {s + 1}
              </p>
              {!fixed && (
                <ReorderButtons
                  index={s}
                  count={slots.length}
                  subject={`${box.label.toLowerCase()} ${s + 1}`}
                  onMove={(d) => replace(swap(slots, s, d))}
                  onRemove={slots.length > box.min ? () => replace(slots.filter((_, k) => k !== s)) : undefined}
                  dense
                />
              )}
            </div>
            {box.fields.map((f) => (
              <FieldInput key={f.key} field={f} path={[...slotPath, f.key]} widgetId={slot.id} />
            ))}
            <WidgetList
              listKey={slotKey(slot.id)}
              base={[...slotPath, "widgets"]}
              widgets={slot.widgets ?? []}
              allowed={box.child_types}
              subject={`${box.label.toLowerCase()} ${s + 1}`}
              onChange={(next) => write(updateList(rows, slotKey(slot.id), () => next))}
            />
          </div>
        );
      })}
      {!fixed && (
        <Button type="button" size="sm" variant="secondary" disabled={slots.length >= box.max} onClick={() => replace([...slots, slotWith(box, taken(), slots.length)])}>
          + Add {box.label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

/** A widget's own words, as the collapsed card's reminder of it. */
function snippet(widget: Widget): string {
  if (Array.isArray(widget.slots)) {
    const names = (widget.slots as Slot[]).map((slot) => String(slot.label ?? slot.title ?? "")).filter(Boolean);
    if (names.length) return names.join(", ");
  }
  for (const key of ["text", "label", "title", "caption"]) {
    const v = widget[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (typeof widget.html === "string") return widget.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const first = Array.isArray(widget.items) ? (widget.items[0] as { question?: string; text?: string } | undefined) : undefined;
  return first?.question ?? first?.text ?? "";
}

function WidgetCard({ listKey, widget, path, index, count, targets, here, onMove, onRemove, onDuplicate, onMoveTo }: {
  listKey: string;
  widget: Widget;
  path: Path;
  index: number;
  count: number;
  targets: Target[];
  here: string;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  onMoveTo: (target: string) => void;
}) {
  const { spec, isOpen, toggle, dnd } = useLayout();
  const info = spec.widgets.find((w) => w.value === widget.type);
  const open = isOpen(widget.id, path);
  const text = snippet(widget);
  const moveId = `${widget.id}-move`;

  return (
    <li
      data-layout-widget-card={widget.type}
      {...dnd.target(listKey, index)}
      className={cn("relative min-w-0 rounded-lg border border-line-strong bg-card", dnd.dragging(listKey, index) && "opacity-50")}
    >
      <DropLine above={dnd.line(listKey, index)} below={index === count - 1 && dnd.line(listKey, count)} gap="-0.375rem" />
      <div className="flex flex-wrap items-center gap-2 p-2">
        <Grip props={dnd.handle(listKey, index, widget)} label={info?.label.toLowerCase() ?? "widget"} />
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
          {info.container && <SlotsEditor widget={widget} info={info} path={path} />}
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
