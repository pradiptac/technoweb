"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CoverField } from "@/components/admin/cover-field";
import { MediaBrowser } from "@/components/admin/media-browser";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { IconField } from "@/components/admin/icon-field-lazy";
import { cn } from "@/lib/utils";

/**
 * The pieces every block editor is made of.
 *
 * A block's content is one nested object the form posts as JSON, so each
 * field here is bound to a **path** into it (`["sets", 0, "plans", 2,
 * "name"]`) rather than to an input name — reordering a repeater is a state
 * change, never a renaming of every input after the row that moved (the
 * slide repeater's argument). A 422 comes back keyed the way the API reads
 * the payload, `content.sets.0.plans.2.name`, and each field finds its own
 * message by the same path.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Path = (string | number)[];
export type Obj = { [key: string]: Json };

export function getIn(value: Json | undefined, path: Path): Json | undefined {
  let cur: Json | undefined = value;
  for (const key of path) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, Json>)[key as never];
  }
  return cur;
}

export function setIn(value: Json | undefined, path: Path, next: Json | undefined): Json {
  if (path.length === 0) return (next ?? null) as Json;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const list = Array.isArray(value) ? [...value] : [];
    list[head] = setIn(list[head], rest, next);
    return list;
  }
  const obj: Obj = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  const child = setIn(obj[head], rest, next);
  if (next === undefined && rest.length === 0) delete obj[head];
  else obj[head] = child;
  return obj;
}

type Ctx = {
  content: Obj;
  set: (path: Path, value: Json | undefined) => void;
  err: (path: Path) => string | undefined;
  /** A URL for every stored path, from the API, so an image field can show what it holds. */
  media: Record<string, string>;
  brands: { id: number; name: string }[];
  /**
   * Prefixes every control's id. The page builder (2026-09-26) draws many
   * sections of one type on one form, and two hero editors both saying
   * `b-heading` is two labels pointing at the first input. Absent, it is
   * `b`, which is every block form's id as it always was.
   */
  idPrefix?: string;
  /**
   * Whether any error sits at or under a path — the page builder's layout
   * editor opens a card with one inside it, so a 422 is never behind a fold.
   */
  anyErr?: (path: Path) => boolean;
  /**
   * Bumped when the content is replaced from outside the fields — the page
   * builder's Undo and Redo, and its assistant (0.127.0). Every plain field
   * here is controlled and follows `content` by itself; a rich-text editor
   * takes its value once, when it mounts, so it is keyed on this and mounts
   * again on the new words.
   */
  epoch?: number;
};

const BlockCtx = createContext<Ctx | null>(null);
export const BlockEditorProvider = BlockCtx.Provider;

export function useBlock(): Ctx {
  const ctx = useContext(BlockCtx);
  if (!ctx) throw new Error("useBlock outside BlockEditorProvider");
  return ctx;
}

const idFor = (path: Path, prefix = "b") => `${prefix}-${path.join("-")}`;

export function Text({ path, label, hint, placeholder, multiline, required, type = "text" }: {
  path: Path; label: string; hint?: ReactNode; placeholder?: string; multiline?: boolean; required?: boolean; type?: string;
}) {
  const { content, set, err, idPrefix } = useBlock();
  const value = getIn(content, path);
  const id = idFor(path, idPrefix);
  const props = {
    id,
    // A `datetime-local` input shows `YYYY-MM-DDTHH:MM` and nothing else, so a
    // stored ISO string with seconds and an offset is trimmed to fit.
    value: typeof value === "string" || typeof value === "number"
      ? (type === "datetime-local" ? String(value).slice(0, 16) : String(value))
      : "",
    placeholder,
    required,
    onChange: (e: { target: { value: string } }) => set(path, e.target.value === "" ? undefined : e.target.value),
  };
  return (
    <Field label={label} htmlFor={id} hint={hint} error={err(path)}>
      {multiline ? <Textarea rows={3} {...props} /> : <Input type={type} {...props} />}
    </Field>
  );
}

export function NumberInput({ path, label, hint, min, max, step, scale = 1 }: {
  path: Path; label: string; hint?: ReactNode; min?: number; max?: number; step?: number;
  /** Stored value = typed value × scale — rupees typed, paise stored. */
  scale?: number;
}) {
  const { content, set, err, idPrefix } = useBlock();
  const value = getIn(content, path);
  const id = idFor(path, idPrefix);
  return (
    <Field label={label} htmlFor={id} hint={hint} error={err(path)}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={typeof value === "number" ? String(value / scale) : ""}
        onChange={(e) => {
          const raw = e.target.value;
          set(path, raw === "" ? undefined : Math.round(Number(raw) * scale));
        }}
      />
    </Field>
  );
}

export function Toggle({ path, label, hint }: { path: Path; label: string; hint?: ReactNode }) {
  const { content, set, idPrefix } = useBlock();
  const id = idFor(path, idPrefix);
  return (
    <div className="mb-[18px]">
      <label htmlFor={id} className="inline-flex min-h-6 cursor-pointer items-center gap-2 text-13-5">
        <input id={id} type="checkbox" className="size-4 accent-brand-600" checked={getIn(content, path) === true} onChange={(e) => set(path, e.target.checked)} />
        {label}
      </label>
      {hint && <p className="mt-1 text-12-5 text-faint">{hint}</p>}
    </div>
  );
}

export function Choice({ path, label, options, hint, fallback }: {
  path: Path; label: string; options: { value: string; label: string }[]; hint?: ReactNode; fallback?: string;
}) {
  const { content, set, err, idPrefix } = useBlock();
  const value = getIn(content, path);
  const id = idFor(path, idPrefix);
  return (
    <Field label={label} htmlFor={id} hint={hint} error={err(path)} variant="float-static">
      <Select id={id} value={typeof value === "string" ? value : fallback ?? options[0]?.value} onChange={(e) => set(path, e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );
}

export function ImagePath({ path, label, hint }: { path: Path; label: string; hint?: string }) {
  const { content, set, err, media, idPrefix } = useBlock();
  const value = getIn(content, path);
  const stored = typeof value === "string" ? value : null;
  const message = err(path);
  return (
    <div>
      <CoverField
        name={`_media_${idFor(path, idPrefix)}`}
        label={label}
        hint={hint}
        defaultPath={stored}
        defaultUrl={stored ? media[stored] ?? null : null}
        onPathChange={(p) => set(path, p ?? undefined)}
      />
      {message && <p className="-mt-3 mb-4 text-12-5 text-err">{message}</p>}
    </div>
  );
}

/** A document from the library's Files tab — the gated download's PDF, a downloads section's file. */
export function FilePath({ path, label, hint, accept = ".pdf", noun = "a PDF" }: {
  path: Path;
  label: string;
  hint?: string;
  /** The extensions offered; a PDF by default. */
  accept?: string;
  /** What the button chooses: "a PDF", "a file". */
  noun?: string;
}) {
  const { content, set, err } = useBlock();
  const [open, setOpen] = useState(false);
  const value = getIn(content, path);
  const stored = typeof value === "string" ? value : null;
  const message = err(path);
  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-13-5 font-semibold">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("min-w-0 flex-1 truncate rounded border border-line-strong bg-card px-3 py-2.5 text-13", !stored && "text-faint")}>
          {stored ? stored.split("/").pop() : "No file chosen"}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>Choose {noun}</Button>
        {stored && <Button type="button" variant="ghost" size="sm" onClick={() => set(path, undefined)}>Clear</Button>}
      </div>
      {hint && <p className="mt-1.5 text-12-5 text-faint">{hint}</p>}
      {message && <p className="mt-1.5 text-12-5 text-err">{message}</p>}
      <MediaBrowser open={open} onClose={() => setOpen(false)} kind="file" title={`Choose ${noun}`} accept={accept} onPick={(f) => { set(path, f.path); setOpen(false); }} />
    </div>
  );
}

export function IconPick({ path, label = "Icon" }: { path: Path; label?: string }) {
  const { content, set, idPrefix } = useBlock();
  const value = getIn(content, path);
  return <IconField id={idFor(path, idPrefix)} label={label} value={typeof value === "string" ? value : ""} onChange={(v) => set(path, v || undefined)} />;
}

/** A list of rows, each drawn by `row`, with reorder, remove and add. */
export function Repeater({ path, label, subject, blank, min = 0, max = 50, hint, row }: {
  path: Path; label: string; subject: string; blank: () => Json; min?: number; max?: number; hint?: ReactNode;
  row: (rowPath: Path, index: number) => ReactNode;
}) {
  const { content, set, err } = useBlock();
  const raw = getIn(content, path);
  const rows = Array.isArray(raw) ? raw : [];
  const move = (i: number, delta: -1 | 1) => {
    const next = [...rows];
    const [item] = next.splice(i, 1);
    next.splice(i + delta, 0, item);
    set(path, next);
  };
  const message = err(path);

  return (
    <fieldset className="mb-6">
      <legend className="mb-1 text-14 font-semibold">{label}</legend>
      {hint && <p className="mb-3 text-12-5 text-faint">{hint}</p>}
      {message && <p className="mb-3 text-12-5 text-err">{message}</p>}
      <ol className="grid gap-3">
        {rows.map((_, i) => (
          <li key={i} className="rounded-lg border border-line-strong bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-12 font-semibold uppercase tracking-[.06em] text-faint">{subject} {i + 1}</span>
              <ReorderButtons
                index={i}
                count={rows.length}
                subject={`${subject.toLowerCase()} ${i + 1}`}
                onMove={(d) => move(i, d)}
                onRemove={rows.length > min ? () => set(path, rows.filter((__, j) => j !== i)) : undefined}
                dense
              />
            </div>
            {row([...path, i], i)}
          </li>
        ))}
      </ol>
      {rows.length < max && (
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => set(path, [...rows, blank()])}>
          Add {subject.toLowerCase()}
        </Button>
      )}
    </fieldset>
  );
}

/** Two or three fields side by side from `sm`. */
export function Row({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cn("grid gap-x-3", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>{children}</div>;
}
