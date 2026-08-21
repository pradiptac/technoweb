"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CaseStudyResult } from "@/types/api";

const MAX = 8;

/**
 * The headline stats on a case study — a repeating list of figure + label
 * pairs, e.g. "-71%" / "Network tickets".
 *
 * Serialised into one hidden JSON input rather than indexed field names
 * (results[0][value]…). FormData flattens either way, but a single value
 * keeps the server action's parsing trivial and matches how the body editor
 * and cover picker already submit.
 */
export function ResultsField({
  defaultValue, error,
}: {
  defaultValue: CaseStudyResult[];
  error?: string;
}) {
  const [rows, setRows] = useState<CaseStudyResult[]>(
    defaultValue.length ? defaultValue : [{ value: "", label: "" }],
  );

  const update = (i: number, key: keyof CaseStudyResult, v: string) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, [key]: v } : row)));

  // Half-filled rows are dropped rather than sent for the API to reject —
  // an empty trailing row is a normal thing to leave behind.
  const complete = rows.filter((r) => r.value.trim() && r.label.trim());

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-[13.5px] font-semibold">Results</span>
      <p className="mb-3 text-[12.5px] text-faint">
        The figures shown across the top of the case study. Four or fewer read best.
      </p>

      <input type="hidden" name="results" value={JSON.stringify(complete)} />

      <ul className="grid gap-2.5">
        {rows.map((row, i) => (
          <li key={i} className="flex flex-wrap items-start gap-2">
            <Input
              aria-label={`Result ${i + 1} figure`}
              placeholder="-71%"
              value={row.value}
              onChange={(e) => update(i, "value", e.target.value)}
              className="w-[110px] font-mono"
            />
            <Input
              aria-label={`Result ${i + 1} label`}
              placeholder="Network tickets"
              value={row.label}
              onChange={(e) => update(i, "label", e.target.value)}
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => setRows((r) => (r.length === 1 ? [{ value: "", label: "" }] : r.filter((_, n) => n !== i)))}
              aria-label={`Remove result ${i + 1}`}
              className="rounded border border-line-strong bg-white px-3 py-[11px] text-[13px] font-semibold text-muted hover:border-faint hover:text-ink"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {rows.length < MAX && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2.5"
          onClick={() => setRows((r) => [...r, { value: "", label: "" }])}
        >
          Add result
        </Button>
      )}

      {error && <p className="mt-1.5 text-[12.5px] text-err">{error}</p>}
    </div>
  );
}
