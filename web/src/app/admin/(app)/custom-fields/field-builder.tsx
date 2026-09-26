"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import type {
  AdminCustomFieldGroup, CustomFieldKind, CustomFieldKindOption, CustomFieldSettings, CustomFieldTargetOption,
} from "@/types/api";

type Existing = NonNullable<AdminCustomFieldGroup["fields"]>[number];

type Row = {
  /** The row's identity in this editor only — never in the markup's values. */
  rowKey: string;
  id?: number;
  key: string;
  label: string;
  kind: CustomFieldKind;
  help: string;
  required: boolean;
  show_on_page: boolean;
  options: { value: string; label: string }[];
  settings: CustomFieldSettings;
  values_count: number;
};

/**
 * The fields of a custom field group, edited as a list and submitted as one
 * JSON value — the `forms/field-builder` pattern, with the one difference that
 * matters: a saved field carries its `id` back, because the values typed into
 * it hang off that row. The API updates a row that names its id, creates one
 * that does not, and deletes only a row nobody sent — so removing a field here
 * removes what was typed into it, and the remove button says how much.
 *
 * The kinds and the targets come from the API's `meta`, never a list here.
 */
export function FieldBuilder({
  fields, kinds, targets,
}: {
  fields: Existing[];
  kinds: CustomFieldKindOption[];
  targets: CustomFieldTargetOption[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    fields.map((f) => ({
      rowKey: `f${f.id}`,
      id: f.id,
      key: f.key,
      label: f.label,
      kind: f.kind,
      help: f.help ?? "",
      required: f.required,
      show_on_page: f.show_on_page,
      options: f.options ?? [],
      settings: f.settings ?? {},
      values_count: f.values_count,
    })),
  );
  const [counter, setCounter] = useState(0);

  const patch = (i: number, next: Partial<Row>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next } : row)));

  const setting = (i: number, key: keyof CustomFieldSettings, value: string) => {
    const parsed = key === "target" ? (value || null) : value === "" ? null : Number(value);
    setRows((r) => r.map((row, n) => (n === i ? { ...row, settings: { ...row.settings, [key]: parsed } } : row)));
  };

  const move = (i: number, by: number) =>
    setRows((r) => {
      const to = i + by;
      if (to < 0 || to >= r.length) return r;
      const copy = [...r];
      [copy[i], copy[to]] = [copy[to], copy[i]];
      return copy;
    });

  const payload = rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    key: row.key,
    label: row.label,
    kind: row.kind,
    help: row.help || null,
    required: row.required,
    show_on_page: row.show_on_page,
    options: row.options,
    settings: row.settings,
  }));

  const hasOptions = (kind: CustomFieldKind) => kinds.find((k) => k.value === kind)?.has_options ?? false;

  return (
    <div>
      <input type="hidden" name="fields" value={JSON.stringify(payload)} />

      {rows.length === 0 && (
        <p className="mb-4 rounded border border-dashed border-line-strong px-4 py-6 text-center text-13-5 text-muted">
          No fields yet. Add the first one below.
        </p>
      )}

      <ol className="grid gap-4">
        {rows.map((row, i) => (
          <li key={row.rowKey} className="rounded-lg border border-line-strong bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-13 font-semibold text-muted">Field {i + 1}</span>
              <code className="font-mono text-12 text-faint">{row.key || "—"}</code>
              {row.values_count > 0 && (
                <span className="text-12 text-faint">
                  {row.values_count} record{row.values_count === 1 ? "" : "s"} hold a value
                </span>
              )}
              <ReorderButtons
                className="ml-auto" index={i} count={rows.length} subject={`field ${i + 1}`}
                onMove={(by) => move(i, by)}
                onRemove={() => {
                  if (row.values_count > 0 && !window.confirm(
                    `Remove "${row.label}"? The values on ${row.values_count} record${row.values_count === 1 ? "" : "s"} go with it when you save.`,
                  )) return;
                  setRows((r) => r.filter((_, n) => n !== i));
                }}
              />
            </div>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Label" htmlFor={`label-${row.rowKey}`}>
                <Input
                  id={`label-${row.rowKey}`}
                  value={row.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    // The key follows the label until the field is saved;
                    // after that it is the editor's to change.
                    patch(i, row.id ? { label } : { label, key: keyFrom(label) });
                  }}
                />
              </Field>

              <Field label="Key" htmlFor={`key-${row.rowKey}`}
                hint="What templates and the API read it by. Renaming keeps the values.">
                <Input id={`key-${row.rowKey}`} className="font-mono" value={row.key}
                  onChange={(e) => patch(i, { key: keyFrom(e.target.value) })} />
              </Field>

              <Field label="Type" htmlFor={`kind-${row.rowKey}`} variant="float-static"
                hint={row.values_count > 0 ? "Fixed: this field already holds values." : kinds.find((k) => k.value === row.kind)?.blurb}>
                <Select
                  id={`kind-${row.rowKey}`}
                  value={row.kind}
                  disabled={row.values_count > 0}
                  onChange={(e) => patch(i, { kind: e.target.value as CustomFieldKind })}
                >
                  {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </Select>
              </Field>

              <Field label="Help text" htmlFor={`help-${row.rowKey}`}>
                <Input id={`help-${row.rowKey}`} value={row.help} onChange={(e) => patch(i, { help: e.target.value })} />
              </Field>
            </div>

            {hasOptions(row.kind) && (
              <Field
                label="Options" htmlFor={`opt-${row.rowKey}`} variant="above"
                hint="One per line. These are the only values the API will accept."
              >
                <Textarea
                  id={`opt-${row.rowKey}`}
                  rows={4}
                  value={row.options.map((o) => o.label).join("\n")}
                  onChange={(e) => patch(i, {
                    options: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean)
                      .map((label) => ({ value: keyFrom(label) || label, label })),
                  })}
                />
              </Field>
            )}

            {row.kind === "number" && (
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Minimum" htmlFor={`min-${row.rowKey}`}>
                  <Input id={`min-${row.rowKey}`} type="number" step="any" value={row.settings.min ?? ""}
                    onChange={(e) => setting(i, "min", e.target.value)} />
                </Field>
                <Field label="Maximum" htmlFor={`max-${row.rowKey}`}>
                  <Input id={`max-${row.rowKey}`} type="number" step="any" value={row.settings.max ?? ""}
                    onChange={(e) => setting(i, "max", e.target.value)} />
                </Field>
              </div>
            )}

            {row.kind === "text" && (
              <Field label="Longest answer, in characters" htmlFor={`len-${row.rowKey}`} hint="Up to 255.">
                <Input id={`len-${row.rowKey}`} type="number" min={1} max={255} value={row.settings.max_length ?? ""}
                  onChange={(e) => setting(i, "max_length", e.target.value)} />
              </Field>
            )}

            {row.kind === "list" && (
              <Field label="Most items" htmlFor={`items-${row.rowKey}`} hint="Up to 100; 30 when blank.">
                <Input id={`items-${row.rowKey}`} type="number" min={1} max={100} value={row.settings.max_items ?? ""}
                  onChange={(e) => setting(i, "max_items", e.target.value)} />
              </Field>
            )}

            {row.kind === "relation" && (
              <Field label="Links to" htmlFor={`target-${row.rowKey}`} variant="float-static">
                <Select id={`target-${row.rowKey}`} value={row.settings.target ?? ""}
                  onChange={(e) => setting(i, "target", e.target.value)}>
                  <option value="">Choose…</option>
                  {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2.5 text-13-5">
                <input type="checkbox" checked={row.required} className="size-4 accent-brand-600"
                  onChange={(e) => patch(i, { required: e.target.checked })} />
                Required
              </label>
              <label className="flex items-center gap-2.5 text-13-5">
                <input type="checkbox" checked={row.show_on_page} className="size-4 accent-brand-600"
                  onChange={(e) => patch(i, { show_on_page: e.target.checked })} />
                Show on the page
              </label>
            </div>
          </li>
        ))}
      </ol>

      <Button
        type="button" variant="secondary" size="sm" className="mt-4"
        onClick={() => {
          setCounter((c) => c + 1);
          setRows((r) => [...r, {
            rowKey: `new-${counter}`, key: "", label: "", kind: "text", help: "",
            required: false, show_on_page: true, options: [], settings: {}, values_count: 0,
          }]);
        }}
      >
        Add field
      </Button>
    </div>
  );
}

/** The API's rule, applied as you type rather than reported back as a 422. */
function keyFrom(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+/, "").replace(/_+$/, "").slice(0, 60);
}
