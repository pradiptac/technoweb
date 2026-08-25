"use client";

import { useState } from "react";

/**
 * Many-to-many picker — the products a solution uses, the industries it
 * serves.
 *
 * A scrolling list of checkboxes rather than a <select multiple>, which is
 * genuinely hard to operate: it needs ctrl-click to add, silently discards
 * the whole selection on a stray click, and gives no indication that more
 * options exist below the fold. Checkboxes cost more vertical space and are
 * worth it.
 *
 * Each checked box submits its own value under the same name, which is the
 * plain-HTML convention the server action reads with getAll().
 */
export function RelationPicker({
  name, label, hint, options, defaultValue, error,
}: {
  name: string;
  label: string;
  hint?: string;
  options: { id: number; name: string }[];
  defaultValue: number[];
  error?: string;
}) {
  const [selected, setSelected] = useState<number[]>(defaultValue);

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <fieldset className="mb-[18px]">
      <legend className="mb-[7px] text-[13.5px] font-semibold">{label}</legend>
      {hint && <p className="mb-2.5 text-[12.5px] text-faint">{hint}</p>}

      {options.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing to choose from yet.</p>
      ) : (
        <div className="max-h-[210px] overflow-y-auto rounded border border-line-strong bg-card p-3">
          <ul className="grid gap-1.5">
            {options.map((o) => (
              <li key={o.id}>
                <label className="flex items-start gap-2 text-[13.5px]">
                  <input
                    type="checkbox"
                    name={name}
                    value={o.id}
                    checked={selected.includes(o.id)}
                    onChange={() => toggle(o.id)}
                    className="mt-[3px]"
                  />
                  <span className="min-w-0">{o.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-1.5 text-[12.5px] text-faint">
        {selected.length} selected
      </p>

      {error && <p className="mt-1.5 text-[12.5px] text-err">{error}</p>}
    </fieldset>
  );
}
