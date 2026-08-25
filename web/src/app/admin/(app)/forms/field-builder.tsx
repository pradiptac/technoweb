"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import type { FormFieldPayload } from "@/lib/admin";
import type { FormField } from "@/types/api";

type Row = FormFieldPayload & { key: string };

const KINDS: { value: FormFieldPayload["kind"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

/**
 * The fields, edited as a list and submitted as one JSON field.
 *
 * The key is the part worth being careful about: it is what the answer is
 * stored and emailed under, so it is derived from the label on first entry and
 * then left alone. Renaming a key silently orphans every answer already
 * collected under the old one — the hint says so rather than the form
 * preventing it, because sometimes renaming is exactly what is wanted.
 */
export function FieldBuilder({ fields }: { fields: FormField[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    fields.map((f, i) => ({
      key: `f${f.id}-${i}`,
      kind: f.kind,
      name: f.name,
      label: f.label,
      placeholder: f.placeholder ?? "",
      help: f.help ?? "",
      required: f.required,
      width: f.width,
      options: f.options ?? [],
    })),
  );

  const patch = (i: number, next: Partial<FormFieldPayload>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next } : row)));

  const move = (i: number, by: number) =>
    setRows((r) => {
      const to = i + by;
      if (to < 0 || to >= r.length) return r;
      const copy = [...r];
      [copy[i], copy[to]] = [copy[to], copy[i]];
      return copy;
    });

  return (
    <div>
      <input type="hidden" name="fields" value={JSON.stringify(rows.map(stripKey))} />

      {rows.length === 0 && (
        <p className="mb-4 rounded border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">
          No fields yet. A form with no fields is not published anywhere — the public
          endpoint answers 404 rather than showing an empty box.
        </p>
      )}

      <ol className="grid gap-4">
        {rows.map((row, i) => (
          <li key={row.key} className="rounded-lg border border-line-strong bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-muted">Field {i + 1}</span>
              <code className="font-mono text-[12px] text-faint">{row.name || "—"}</code>
              <div className="ml-auto flex gap-1.5">
                <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑<span className="sr-only">Move field {i + 1} up</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
                  ↓<span className="sr-only">Move field {i + 1} down</span>
                </Button>
                <Button
                  type="button" variant="ghost" size="sm" className="text-err"
                  onClick={() => setRows((r) => r.filter((_, n) => n !== i))}
                >
                  Remove<span className="sr-only"> field {i + 1}</span>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Label" htmlFor={`label-${row.key}`}>
                <Input
                  id={`label-${row.key}`}
                  value={row.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    // The key follows the label until the field has been
                    // saved once; after that it is the editor's to change.
                    patch(i, row.name && !row.key.startsWith("new-") ? { label } : { label, name: keyFrom(label) });
                  }}
                />
              </Field>

              <Field
                label="Key"
                htmlFor={`name-${row.key}`}
                hint="Stored and emailed under this. Changing it orphans answers already collected."
              >
                <Input
                  id={`name-${row.key}`}
                  value={row.name}
                  onChange={(e) => patch(i, { name: keyFrom(e.target.value) })}
                />
              </Field>

              <Field label="Type" htmlFor={`kind-${row.key}`} variant="float-static">
                <Select
                  id={`kind-${row.key}`}
                  value={row.kind}
                  onChange={(e) => patch(i, { kind: e.target.value as FormFieldPayload["kind"] })}
                >
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </Select>
              </Field>

              <Field label="Width" htmlFor={`width-${row.key}`} variant="float-static">
                <Select
                  id={`width-${row.key}`}
                  value={row.width ?? "full"}
                  onChange={(e) => patch(i, { width: e.target.value as "half" | "full" })}
                >
                  <option value="full">Full width</option>
                  <option value="half">Half width</option>
                </Select>
              </Field>

              <Field label="Placeholder" htmlFor={`ph-${row.key}`}>
                <Input id={`ph-${row.key}`} value={row.placeholder ?? ""} onChange={(e) => patch(i, { placeholder: e.target.value })} />
              </Field>

              <Field label="Help text" htmlFor={`help-${row.key}`}>
                <Input id={`help-${row.key}`} value={row.help ?? ""} onChange={(e) => patch(i, { help: e.target.value })} />
              </Field>
            </div>

            {row.kind === "select" && (
              <Field
                label="Options"
                htmlFor={`opt-${row.key}`}
                hint="One per line. These are the only values the API will accept for this field."
                variant="above"
              >
                <textarea
                  id={`opt-${row.key}`}
                  rows={4}
                  className="w-full rounded border border-line-strong bg-card px-[13px] py-[11px] text-[15px]"
                  value={(row.options ?? []).map((o) => o.label).join("\n")}
                  onChange={(e) => patch(i, {
                    options: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean)
                      .map((label) => ({ value: keyFrom(label) || label, label })),
                  })}
                />
              </Field>
            )}

            <label className="flex items-center gap-2.5 text-[13.5px]">
              <input
                type="checkbox"
                checked={Boolean(row.required)}
                onChange={(e) => patch(i, { required: e.target.checked })}
                className="size-4 accent-brand-600"
              />
              Required
            </label>
          </li>
        ))}
      </ol>

      <Button
        type="button" variant="secondary" size="sm" className="mt-4"
        onClick={() => setRows((r) => [...r, {
          key: `new-${r.length}-${Date.now()}`,
          kind: "text", name: "", label: "", placeholder: "", help: "",
          required: false, width: "full", options: [],
        }])}
      >
        Add field
      </Button>
    </div>
  );
}

function stripKey({ key, ...field }: Row): FormFieldPayload {
  void key;
  return field;
}

/** The API's rule, applied as you type rather than reported back as a 422. */
function keyFrom(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+/, "").replace(/_+$/, "").slice(0, 60);
}
