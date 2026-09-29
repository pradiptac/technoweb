"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX = 20;

/**
 * A repeating list of plain strings — a solution's benefits, its technologies.
 *
 * Submits one hidden JSON value, the same convention as ResultsField and the
 * body editor, so the server action parses one field rather than reassembling
 * indexed names. Blank rows are dropped: an empty trailing row is a normal
 * thing to leave behind while typing.
 */
export function StringListField({
  name, label, hint, placeholder, defaultValue, error, max = MAX, maxLength,
}: {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultValue: string[];
  error?: string;
  /** How many rows it offers — the API's own cap for the field. */
  max?: number;
  /** Characters per row, the API's limit, so the browser stops the typing. */
  maxLength?: number;
}) {
  const [rows, setRows] = useState<string[]>(defaultValue.length ? defaultValue : [""]);

  const filled = rows.map((r) => r.trim()).filter(Boolean);

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-13-5 font-semibold">{label}</span>
      {hint && <p className="mb-3 text-12-5 text-faint">{hint}</p>}

      <input type="hidden" name={name} value={JSON.stringify(filled)} />

      <ul className="grid gap-2.5">
        {rows.map((row, i) => (
          <li key={i} className="flex flex-wrap items-start gap-2">
            <Input
              aria-label={`${label} ${i + 1}`}
              placeholder={placeholder}
              value={row}
              maxLength={maxLength}
              onChange={(e) => setRows((r) => r.map((v, n) => (n === i ? e.target.value : v)))}
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => setRows((r) => (r.length === 1 ? [""] : r.filter((_, n) => n !== i)))}
              aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
              className="rounded border border-line-strong bg-card px-3 py-[11px] text-13 font-semibold text-muted hover:border-faint hover:text-ink"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {rows.length < max && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2.5"
          onClick={() => setRows((r) => [...r, ""])}
        >
          Add
        </Button>
      )}

      {error && <p className="mt-1.5 text-12-5 text-err">{error}</p>}
    </div>
  );
}
