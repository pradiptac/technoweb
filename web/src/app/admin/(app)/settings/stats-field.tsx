"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { IconField } from "@/components/admin/icon-field-lazy";
import { statPairs, type StatPair } from "@/lib/site-settings";

/**
 * The homepage statistics as rows of inputs — a figure, a label and an
 * icon each — rather than a textarea of `value|label|icon` lines.
 *
 * The client asked for it to be "input based for every field"
 * (2026-09-17): the line format was one typo away from a statistic that
 * silently did not render (`statPairs` drops a line short of its second
 * column), and an icon was a name typed from memory rather than picked.
 * Here the icon is the same picker the entity forms use.
 *
 * **The wire format does not change.** The rows are composed back into the
 * same lines and posted through one hidden input under the setting's own
 * name, so the API, the seeder, the public resource and every renderer are
 * untouched — and the setting can still be edited by hand through a
 * script. Composing rather than re-modelling is the whole of the change.
 * A `|` typed into a figure or a label is dropped, because it is the
 * column separator and would split the row on the way back in.
 *
 * `ReorderButtons` for the arrows and Remove, the rule every repeater in
 * the console follows. A row with a blank figure or label is kept on
 * screen while it is being typed and dropped from the posted lines, which
 * is exactly what `statPairs` would do with it anyway.
 */
export function StatsField({
  name, label, hint, defaultValue, subject,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
  /** "hero statistic" — what the reorder buttons call a row. */
  subject: string;
}) {
  const [rows, setRows] = useState<(StatPair & { key: number })[]>(() =>
    statPairs(defaultValue).map((s, i) => ({ ...s, key: i + 1 })),
  );
  const [nextKey, setNextKey] = useState(rows.length + 1);

  const update = (key: number, patch: Partial<StatPair>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (from: number, to: number) =>
    setRows((rs) => {
      if (to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const add = () => { setRows((rs) => [...rs, { key: nextKey, value: "", label: "" }]); setNextKey((k) => k + 1); };

  const clean = (s: string) => s.replace(/\|/g, "").trim();
  const lines = rows
    .filter((r) => clean(r.value) && clean(r.label))
    .map((r) => [clean(r.value), clean(r.label), r.icon?.trim() ?? ""].filter((_, i) => i < 2 || r.icon?.trim()).join("|"))
    .join("\n");

  return (
    <fieldset className="mb-[18px]">
      <legend className="mb-1 text-13-5 font-semibold">{label}</legend>
      {hint && <p className="measure mb-3 text-12-5 text-faint">{hint}</p>}
      <input type="hidden" name={name} value={lines} />

      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={row.key} className="rounded-lg border border-line bg-card p-3">
            <div className="grid gap-x-3 sm:grid-cols-[1fr_1.6fr_auto]">
              <Field label="Figure" htmlFor={`${name}-${row.key}-value`} variant="float" className="mb-0">
                <Input id={`${name}-${row.key}-value`} value={row.value} onChange={(e) => update(row.key, { value: e.target.value })} placeholder="340+" />
              </Field>
              <Field label="Label" htmlFor={`${name}-${row.key}-label`} variant="float" className="mb-0">
                <Input id={`${name}-${row.key}-label`} value={row.label} onChange={(e) => update(row.key, { label: e.target.value })} placeholder="Sites under AMC" />
              </Field>
              <ReorderButtons
                className="self-center"
                index={i}
                count={rows.length}
                subject={`${subject} ${i + 1}`}
                onMove={(by) => move(i, i + by)}
                onRemove={() => remove(row.key)}
              />
            </div>
            <div className="mt-3">
              <IconField id={`${name}-${row.key}-icon`} value={row.icon ?? ""} onChange={(icon) => update(row.key, { icon: icon || undefined })} />
            </div>
          </li>
        ))}
      </ol>

      <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={add}>
        Add a statistic
      </Button>
    </fieldset>
  );
}
