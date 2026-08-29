"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Alert } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { IconChevronDown, IconMenu } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { MenuItemNode, MenuLocationOption, MenuTypeOption, MenuTarget } from "@/types/api";
import { lookupTargetsAction } from "./actions";

/**
 * The menu builder: a flat list carrying a depth per row.
 *
 * **Flat-with-depth rather than a nested drag target, and that is the whole
 * design.** Nesting the DOM means a drop zone inside a drop zone — the defect
 * the media library already had to be fixed for, where both handlers fire and
 * the work happens twice — and it means every drag has to answer "before,
 * after, or inside?" from a pointer position, which is the part of every
 * hand-rolled tree that is wrong on the diagonal. One list and an integer per
 * row makes reordering and re-parenting the same operation, and it is what
 * WordPress does for the same reason.
 *
 * Converting back to a tree happens once, at save, in `nest()` below.
 *
 * **Dragging is not the only way to move an item**, and that is not a nicety:
 * this console is gated on audits that fail an interface a keyboard cannot
 * drive. Every row carries Up, Down, Indent and Outdent, which are also
 * simply faster than dragging for a one-place move.
 */

type Row = {
  /** Stable only within this editing session — the API replaces every row on
   *  save, so these are React keys and nothing else. */
  key: string;
  depth: number;
  label: string;
  type: string;
  target_id: number | null;
  target_label: string | null;
  url: string | null;
  icon: string | null;
  description: string | null;
  open_in_new_tab: boolean;
  is_active: boolean;
  /** What the API said this resolves to. Null means the destination is gone,
   *  and the public site will drop the item. */
  resolved_url: string | null;
};

let seq = 0;
const nextKey = () => `row-${seq++}`;

/** The API's nested tree, flattened for editing. */
function flatten(items: MenuItemNode[], depth = 0): Row[] {
  return items.flatMap((item) => [
    {
      key: nextKey(),
      depth,
      label: item.label,
      type: item.type,
      target_id: item.target_id,
      target_label: null,
      url: item.url,
      icon: item.icon,
      description: item.description,
      open_in_new_tab: item.open_in_new_tab,
      is_active: item.is_active,
      resolved_url: item.resolved_url,
    },
    ...flatten(item.children ?? [], depth + 1),
  ]);
}

/**
 * Back to a tree, once, at save.
 *
 * A row's parent is the nearest row above it at a shallower depth, which is
 * the only reading of a flat list that can be made — and it is why `indent()`
 * refuses to leave a row deeper than the one above it. Without that invariant
 * a row could claim a depth with no parent to hang from, and this would
 * silently promote it.
 */
function nest(rows: Row[]) {
  type Built = ReturnType<typeof payload> & { children: Built[] };
  const payload = (r: Row) => ({
    label: r.label,
    type: r.type,
    target_id: r.target_id,
    url: r.url,
    icon: r.icon || null,
    description: r.description || null,
    open_in_new_tab: r.open_in_new_tab,
    is_active: r.is_active,
  });

  const roots: Built[] = [];
  const stack: Built[] = [];

  for (const row of rows) {
    const node = { ...payload(row), children: [] as Built[] };
    stack.length = row.depth;
    if (row.depth === 0 || stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return roots;
}

export function MenuBuilder({
  initialName, initialLocation, initialItems, locations, types, maxDepth, onSave,
}: {
  initialName: string;
  initialLocation: string | null;
  initialItems: MenuItemNode[];
  locations: MenuLocationOption[];
  types: MenuTypeOption[];
  maxDepth: number;
  onSave: (payload: { name: string; location: string | null; items: unknown[] }) => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation ?? "");
  const [rows, setRows] = useState<Row[]>(() => flatten(initialItems));
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const mutate = useCallback((next: Row[] | ((prev: Row[]) => Row[])) => {
    setRows(next);
    setDirty(true);
    setResult(null);
  }, []);

  /*
    A refresh with unsaved changes loses the whole arrangement, which on a
    50-item menu is a lot of dragging. `FormActions` gives this to ordinary
    forms; this screen is not one, so it carries its own. It cannot see an
    in-app navigation — `beforeunload` does not fire for a client-side route
    change — which is a documented limitation of the same guard elsewhere.
  */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const move = (from: number, to: number) => {
    mutate((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return normalise(next);
    });
  };

  /*
    Depth is clamped rather than trusted, every time the list changes.

    A row can only be as deep as one more than the row above it, and the first
    row is always a root. Enforcing it here means every other operation —
    drag, delete, move — can be careless about depth and still leave a list
    that `nest()` can read, instead of each of them having to remember.
  */
  const normalise = (list: Row[]): Row[] => {
    let previous = -1;
    return list.map((row) => {
      const depth = Math.min(row.depth, previous + 1, maxDepth - 1);
      previous = depth;
      return depth === row.depth ? row : { ...row, depth };
    });
  };

  const setDepth = (index: number, delta: number) => {
    mutate((prev) => normalise(prev.map((row, i) =>
      i === index ? { ...row, depth: Math.max(0, row.depth + delta) } : row)));
  };

  const update = (key: string, patch: Partial<Row>) =>
    mutate((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const remove = (key: string) =>
    mutate((prev) => normalise(prev.filter((row) => row.key !== key)));

  const add = (row: Omit<Row, "key" | "depth">) => {
    mutate((prev) => [...prev, { ...row, key: nextKey(), depth: 0 }]);
    setResult(null);
  };

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      const outcome = await onSave({ name, location: location || null, items: nest(rows) });
      if (outcome.error) setResult({ tone: "err", text: outcome.error });
      else { setResult({ tone: "ok", text: "Menu saved." }); setDirty(false); }
    } finally {
      setSaving(false);
    }
  };

  const chosen = locations.find((l) => l.value === location);
  const broken = rows.filter((r) => r.resolved_url === null && r.type !== "custom").length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="min-w-0">
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="Menu name" htmlFor="menu-name" variant="float">
            <Input id="menu-name" value={name} required
              onChange={(e) => { setName(e.target.value); setDirty(true); }} />
          </Field>

          <Field
            label="Where it appears"
            htmlFor="menu-location"
            // A Select always has a value, so an animated label has nothing to
            // be displaced by and renders on top of the chosen option.
            variant="float-static"
            hint={chosen?.hint ?? "Not assigned — this menu is stored but renders nowhere."}
          >
            <Select id="menu-location" value={location}
              onChange={(e) => { setLocation(e.target.value); setDirty(true); }}>
              <option value="">Not assigned</option>
              {locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </Select>
          </Field>
        </div>

        {broken > 0 && (
          <Alert tone="warn" title={`${broken} link${broken === 1 ? "" : "s"} no longer resolve`}>
            The record behind {broken === 1 ? "it has" : "them has"} been deleted or renamed
            past recovery. The public site drops {broken === 1 ? "it" : "them"} rather than
            showing a dead link — point {broken === 1 ? "it" : "them"} somewhere or remove
            {broken === 1 ? " it" : " them"}.
          </Alert>
        )}

        {rows.length === 0 ? (
          <EmptyState icon={<IconMenu />} title="Nothing in this menu yet">
            Add links from the panel beside this one. Drag them to reorder, and indent one
            under another to make it a child.
          </EmptyState>
        ) : (
          <ul className="grid gap-1.5">
            {rows.map((row, i) => (
              <li
                key={row.key}
                draggable
                onDragStart={() => setDragging(row.key)}
                onDragEnd={() => { setDragging(null); setOver(null); }}
                onDragOver={(e) => { e.preventDefault(); setOver(row.key); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = rows.findIndex((r) => r.key === dragging);
                  const to = rows.findIndex((r) => r.key === row.key);
                  if (from !== -1 && to !== -1 && from !== to) move(from, to);
                  setDragging(null);
                  setOver(null);
                }}
                style={{ marginLeft: `${row.depth * 28}px` }}
                className={cn(
                  "rounded-lg border bg-card transition-colors",
                  over === row.key && dragging !== row.key ? "border-brand-600" : "border-line-strong",
                  dragging === row.key && "opacity-50",
                  !row.is_active && "opacity-65",
                )}
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  {/* The handle is decoration: the whole row is draggable, and
                      the buttons beside it are what a keyboard uses. */}
                  <span aria-hidden className="cursor-grab text-faint">⠿</span>

                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {row.label || <span className="text-faint">Untitled</span>}
                    {row.depth > 0 && <span className="ml-1.5 text-[11.5px] text-faint">child</span>}
                  </span>

                  <Badge tone={row.type === "custom" ? "closed" : "open"}>
                    {types.find((t) => t.value === row.type)?.label ?? row.type}
                  </Badge>

                  {!row.is_active && <Badge tone="progress">Hidden</Badge>}
                  {row.resolved_url === null && row.type !== "custom" && <Badge tone="urgent">Broken</Badge>}

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Move label="Move up" onClick={() => move(i, i - 1)} disabled={i === 0}>↑</Move>
                    <Move label="Move down" onClick={() => move(i, i + 1)} disabled={i === rows.length - 1}>↓</Move>
                    <Move
                      label="Make a child of the item above"
                      onClick={() => setDepth(i, 1)}
                      disabled={i === 0 || row.depth >= Math.min(maxDepth - 1, rows[i - 1].depth + 1)}
                    >→</Move>
                    <Move label="Move out one level" onClick={() => setDepth(i, -1)} disabled={row.depth === 0}>←</Move>
                    <button
                      type="button"
                      onClick={() => setOpenRow(openRow === row.key ? null : row.key)}
                      aria-expanded={openRow === row.key}
                      aria-label={`Edit ${row.label}`}
                      className="grid size-6 place-items-center rounded text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <IconChevronDown className={cn("size-3.5 transition-transform", openRow === row.key && "rotate-180")} />
                    </button>
                  </div>
                </div>

                {openRow === row.key && (
                  <div className="grid gap-2.5 border-t border-line px-2.5 py-3 sm:grid-cols-2">
                    <Field label="Label" htmlFor={`${row.key}-label`} variant="float">
                      <Input id={`${row.key}-label`} value={row.label}
                        onChange={(e) => update(row.key, { label: e.target.value })} />
                    </Field>

                    {row.type === "custom" ? (
                      <Field label="Address" htmlFor={`${row.key}-url`} variant="float"
                        hint="A path like /support, or a full https:// address.">
                        <Input id={`${row.key}-url`} value={row.url ?? ""}
                          onChange={(e) => update(row.key, { url: e.target.value })} />
                      </Field>
                    ) : (
                      <Field label="Points at" htmlFor={`${row.key}-target`} variant="float-static"
                        hint={row.resolved_url ?? "This record no longer resolves — the site drops the item."}>
                        <Input id={`${row.key}-target`} readOnly
                          value={row.target_label ?? `#${row.target_id ?? "—"}`} />
                      </Field>
                    )}

                    <Field label="Description" htmlFor={`${row.key}-desc`} variant="float"
                      hint="Shown under the label in the header's dropdown panel.">
                      <Input id={`${row.key}-desc`} value={row.description ?? ""}
                        onChange={(e) => update(row.key, { description: e.target.value })} />
                    </Field>

                    <Field label="Icon" htmlFor={`${row.key}-icon`} variant="float"
                      hint="An icon name, the same set the catalogue uses. Leave blank for none.">
                      <Input id={`${row.key}-icon`} value={row.icon ?? ""}
                        onChange={(e) => update(row.key, { icon: e.target.value })} />
                    </Field>

                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={row.open_in_new_tab}
                        onChange={(e) => update(row.key, { open_in_new_tab: e.target.checked })} />
                      Open in a new tab
                    </label>

                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={row.is_active}
                        onChange={(e) => update(row.key, { is_active: e.target.checked })} />
                      Visible on the site
                    </label>

                    <div className="sm:col-span-2">
                      <Button type="button" variant="destructive" size="sm" onClick={() => remove(row.key)}>
                        Remove from menu
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t border-line bg-surface/95 py-3 backdrop-blur-[10px]">
          <Button type="button" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save menu"}
          </Button>
          {dirty && <span className="text-[12.5px] text-faint">Unsaved changes</span>}
          {result && (
            <span role={result.tone === "err" ? "alert" : "status"}
              className={cn("text-[12.5px]", result.tone === "err" ? "text-err" : "text-ok")}>
              {result.text}
            </span>
          )}
        </div>
      </div>

      <AddPanel types={types} onAdd={add} />
    </div>
  );
}

function Move({
  label, onClick, disabled, children,
}: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      // 24px, which is the audit's floor for a target with another inside 24px
      // of its centre — and these sit in a row of five.
      className="grid size-6 place-items-center rounded text-[13px] text-muted hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/**
 * Adding items: pick a kind, then a record — or type an address.
 *
 * The record list is fetched from the API per type and search, never held in
 * the page: a catalogue runs to hundreds of products and a select holding all
 * of them is one nobody can find anything in.
 */
function AddPanel({
  types, onAdd,
}: {
  types: MenuTypeOption[];
  onAdd: (row: Omit<Row, "key" | "depth">) => void;
}) {
  const [type, setType] = useState("custom");
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<MenuTarget[]>([]);
  const [chosen, setChosen] = useState<string>("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const id = useId();
  const needsRecord = types.find((t) => t.value === type)?.needs_record ?? false;

  /*
    Debounced, and the response is dropped if the type or term moved on.

    Without the second half a slow reply for "net" lands after a fast reply for
    "netw" and the list goes backwards while somebody is still typing — the
    classic out-of-order-response bug, which looks like the search box
    ignoring keystrokes.
  */
  const request = useRef(0);
  useEffect(() => {
    if (!needsRecord) return;
    const ticket = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const rows = await lookupTargetsAction(type, query);
      if (ticket === request.current) { setTargets(rows); setLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [type, query, needsRecord]);

  /*
    Derived rather than cleared in the effect.

    Emptying `targets` when the kind changes to Custom would be a setState in
    an effect body — a cascading render, and the lint rule that forbids it is
    right: the list for a kind that shows no list is simply not read. The stale
    rows stay in state and cost nothing.
  */
  const shown = needsRecord ? targets : [];
  const target = shown.find((t) => String(t.id) === chosen);

  const submit = () => {
    if (needsRecord) {
      if (!target) return;
      onAdd({
        label: label.trim() || target.label,
        type,
        target_id: target.id,
        target_label: target.label,
        url: null, icon: null, description: null,
        open_in_new_tab: false, is_active: true,
        resolved_url: target.url,
      });
    } else {
      if (!url.trim()) return;
      onAdd({
        label: label.trim() || url.trim(),
        type: "custom",
        target_id: null, target_label: null,
        url: url.trim(), icon: null, description: null,
        open_in_new_tab: false, is_active: true,
        resolved_url: url.trim(),
      });
    }
    setLabel(""); setUrl(""); setChosen("");
  };

  return (
    <div className="rounded-lg border border-line-strong bg-card p-3.5">
      <h2 className="mb-2.5 text-[13px] font-semibold">Add to this menu</h2>

      <div className="grid gap-2.5">
        <Field label="Kind" htmlFor={`${id}-type`} variant="float-static">
          <Select id={`${id}-type`} value={type}
            onChange={(e) => { setType(e.target.value); setChosen(""); setQuery(""); }}>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>

        {needsRecord ? (
          <>
            <Field label="Search" htmlFor={`${id}-q`} variant="float">
              <Input id={`${id}-q`} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name…" />
            </Field>

            <Field label="Record" htmlFor={`${id}-target`} variant="float-static"
              hint={loading ? "Looking…" : target?.url ?? "The 50 closest matches."}>
              <Select id={`${id}-target`} value={chosen} onChange={(e) => setChosen(e.target.value)}>
                <option value="">Choose…</option>
                {shown.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            </Field>
          </>
        ) : (
          <Field label="Address" htmlFor={`${id}-url`} variant="float"
            hint="A path like /support, or a full https:// address.">
            <Input id={`${id}-url`} value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        )}

        <Field label="Label" htmlFor={`${id}-label`} variant="float"
          hint="Leave blank to use the record's own name.">
          <Input id={`${id}-label`} value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>

        <Button type="button" size="sm" onClick={submit}
          disabled={needsRecord ? !target : !url.trim()}>
          Add to menu
        </Button>
      </div>

      <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] text-faint">
        New items land at the bottom. Drag a row, or use the arrows on it, to move it —
        <span className="font-medium"> →</span> makes it a child of the row above.
      </p>
    </div>
  );
}
