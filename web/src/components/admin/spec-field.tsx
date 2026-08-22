"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX = 40;

type Row = { key: string; value: string };

/**
 * The product spec sheet — "Ports: 24 × 1G", "PoE budget: 195 W".
 *
 * Edited as ordered rows but submitted as a `{label: value}` map, because
 * that is the shape the public product page reads and the seeder writes.
 * Converting here rather than on the server keeps one format on the wire.
 *
 * Rows are held in state, not derived from the map on every render: an
 * object cannot express a half-typed duplicate label, and rebuilding the
 * rows from it would make a row vanish the moment two labels matched.
 */
export function SpecField({
  defaultValue, error,
}: {
  defaultValue: Record<string, string>;
  error?: string;
}) {
  const initial = Object.entries(defaultValue ?? {}).map(([key, value]) => ({ key, value }));
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ key: "", value: "" }]);

  const update = (i: number, field: keyof Row, v: string) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, [field]: v } : row)));

  const move = (i: number, by: number) =>
    setRows((r) => {
      const to = i + by;
      if (to < 0 || to >= r.length) return r;
      const next = [...r];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  // A row needs a label to mean anything; the value may legitimately be
  // empty-ish, so only the label gates inclusion. Later duplicates lose,
  // which matches what the map would do anyway — but here it is visible.
  const map: Record<string, string> = {};
  const duplicates = new Set<number>();
  rows.forEach((r, i) => {
    const key = r.key.trim();
    if (!key) return;
    if (key in map) duplicates.add(i);
    else map[key] = r.value.trim();
  });

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-[13.5px] font-semibold">Specifications</span>
      <p className="mb-3 text-[12.5px] text-faint">
        The table on the product page. Rows appear in this order; a row with no
        label is ignored.
      </p>

      <input type="hidden" name="specifications" value={JSON.stringify(map)} />

      <ul className="grid gap-2.5">
        {rows.map((row, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <Input
              aria-label={`Specification ${i + 1} label`}
              placeholder="Ports"
              value={row.key}
              onChange={(e) => update(i, "key", e.target.value)}
              aria-invalid={duplicates.has(i)}
            />
            <Input
              aria-label={`Specification ${i + 1} value`}
              placeholder="24 × 10/100/1000"
              value={row.value}
              onChange={(e) => update(i, "value", e.target.value)}
            />
            <span className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" aria-label={`Move row ${i + 1} up`}
                disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
              <Button type="button" variant="ghost" size="sm" aria-label={`Move row ${i + 1} down`}
                disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</Button>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove row ${i + 1}`}
                onClick={() => setRows((r) => r.filter((_, n) => n !== i))}>✕</Button>
            </span>
          </li>
        ))}
      </ul>

      {duplicates.size > 0 && (
        <p className="mt-2 text-[12.5px] text-warn">
          Two rows share a label — only the first will be saved.
        </p>
      )}
      {error && <p className="mt-2 text-[12.5px] text-err">{error}</p>}

      {rows.length < MAX && (
        <Button type="button" variant="ghost" size="sm" className="mt-2.5"
          onClick={() => setRows((r) => [...r, { key: "", value: "" }])}>
          Add specification
        </Button>
      )}
    </div>
  );
}
