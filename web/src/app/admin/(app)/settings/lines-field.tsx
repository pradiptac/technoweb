"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ReorderButtons } from "@/components/admin/reorder-buttons";

/**
 * A setting stored as lines, edited as rows of inputs.
 *
 * `StatsField` generalised: it is the same shape — rows, `ReorderButtons`,
 * a hidden input carrying the composed lines under the setting's own name —
 * without the icon picker, and with the columns given by the caller. One
 * column is a plain list (the AMC card's inclusions, one per line); two are
 * `a|b` lines (the homepage's process steps, `title|body`). The wire format
 * is the one `linePairs()` and `lines()` in `lib/site-settings.ts` read, so
 * a setting can still be edited by hand through a script.
 *
 * The same two rules `StatsField` keeps: a `|` typed into a cell is dropped,
 * because it is the column separator and would split the row on the way
 * back in; and a row with a blank first column is kept on screen while it is
 * being typed and left out of the posted lines, which is what the parser
 * would do with it anyway.
 */
export function LinesField({
  name, label, hint, defaultValue, subject, columns, addLabel,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
  /** "step" — what the reorder buttons call a row. */
  subject: string;
  /** One or two columns. `multiline` draws a textarea. */
  columns: { key: string; label: string; placeholder?: string; multiline?: boolean }[];
  addLabel: string;
}) {
  const [rows, setRows] = useState<{ key: number; cells: string[] }[]>(() =>
    (defaultValue ?? "")
      .split("\n")
      .map((l) => l.split("|").map((c) => c.trim()))
      .filter((cells) => cells[0])
      .map((cells, i) => ({ key: i + 1, cells: columns.map((_, c) => cells[c] ?? "") })),
  );
  const [nextKey, setNextKey] = useState(rows.length + 1);

  const update = (key: number, col: number, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, cells: r.cells.map((c, i) => (i === col ? value : c)) } : r)));
  const move = (from: number, to: number) =>
    setRows((rs) => {
      if (to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const add = () => {
    setRows((rs) => [...rs, { key: nextKey, cells: columns.map(() => "") }]);
    setNextKey((k) => k + 1);
  };

  const clean = (s: string) => s.replace(/\|/g, "").trim();
  const composed = rows
    .map((r) => r.cells.map(clean))
    .filter((cells) => cells[0] && (columns.length === 1 || cells[1]))
    .map((cells) => cells.join("|"))
    .join("\n");

  return (
    <fieldset className="mb-[18px]">
      <legend className="mb-1 text-13-5 font-semibold">{label}</legend>
      {hint && <p className="measure mb-3 text-12-5 text-faint">{hint}</p>}
      <input type="hidden" name={name} value={composed} />

      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={row.key} className="rounded-lg border border-line bg-card p-3">
            <div className="grid gap-x-3 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                {columns.map((col, c) => (
                  <Field key={col.key} label={col.label} htmlFor={`${name}-${row.key}-${col.key}`} variant="float" className={c === columns.length - 1 ? "mb-0" : "mb-2"}>
                    {col.multiline ? (
                      <Textarea
                        id={`${name}-${row.key}-${col.key}`}
                        rows={2}
                        value={row.cells[c]}
                        onChange={(e) => update(row.key, c, e.target.value)}
                        placeholder={col.placeholder}
                      />
                    ) : (
                      <Input
                        id={`${name}-${row.key}-${col.key}`}
                        value={row.cells[c]}
                        onChange={(e) => update(row.key, c, e.target.value)}
                        placeholder={col.placeholder}
                      />
                    )}
                  </Field>
                ))}
              </div>
              <ReorderButtons
                className="self-start sm:mt-1"
                index={i}
                count={rows.length}
                subject={`${subject} ${i + 1}`}
                onMove={(by) => move(i, i + by)}
                onRemove={() => remove(row.key)}
              />
            </div>
          </li>
        ))}
      </ol>

      <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={add}>
        {addLabel}
      </Button>
    </fieldset>
  );
}
