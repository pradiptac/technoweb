"use client";

import { useState } from "react";
import { iconMap, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

const NAMES = Object.keys(iconMap) as IconName[];

/**
 * Icon picker for solutions, services, industries — and the menu builder.
 *
 * The icon is stored as a name, and only names in iconMap render on the site —
 * anything else silently draws nothing. So this is a fixed grid of the real
 * icons rather than a free-text field: an editor picks what they can see, and
 * cannot save a name the frontend has never heard of. (The menu builder had a
 * free-text box for months; `globe` typed there drew nothing, for that reason.)
 *
 * Two ways in. Uncontrolled — `defaultValue` and a hidden `<input name>` — for
 * the entity forms, which post through a Server Action. Controlled — `value`
 * and `onChange` — for a screen that saves through a function, like the
 * menu builder, which keeps a row's icon in its own state.
 *
 * The filter box is there because the grid is ~130 tiles: an editor who knows
 * they want "shield" should not have to scan five rows for it.
 */
export function IconField({
  defaultValue, error, value, onChange, name = "icon", id,
}: {
  defaultValue?: string | null;
  error?: string;
  /** Controlled mode: the current name, or "" for none. */
  value?: string;
  onChange?: (name: string) => void;
  /** The hidden input's name, uncontrolled mode only. */
  name?: string;
  /** Distinguishes several pickers on one screen (the filter box's id). */
  id?: string;
}) {
  const [own, setOwn] = useState<string>(
    defaultValue && NAMES.includes(defaultValue as IconName) ? defaultValue : "",
  );
  const [query, setQuery] = useState("");

  const controlled = value !== undefined;
  const selected = controlled ? value : own;
  const select = (next: string) => {
    if (!controlled) setOwn(next);
    onChange?.(next);
  };
  const q = query.trim().toLowerCase();
  const shown = q ? NAMES.filter((n) => n.includes(q)) : NAMES;

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-13-5 font-semibold">Icon</span>

      {!controlled && <input type="hidden" name={name} value={selected} />}

      <div className="rounded border border-line-strong bg-card p-2.5">
        <input
          type="search"
          id={id ? `${id}-icon-filter` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter icons…"
          aria-label="Filter icons"
          className="field mb-2 h-9 w-full rounded border border-line-strong bg-card px-2.5 text-13"
        />
        {/*
          Small fixed tiles that fill the width, rather than six aspect-square
          columns. At six columns each tile was about 60px, so the set was five
          tall rows of mostly empty space — and it gets worse with every icon
          added. auto-fill keeps them 34px whatever the column width, which is
          still comfortably over the 24px tap-target floor the audit enforces.
        */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(34px,1fr))] gap-1">
          {shown.map((n) => {
            const Icon = iconMap[n];
            const active = selected === n;
            return (
              <button
                key={n}
                type="button"
                title={n}
                aria-label={n}
                aria-pressed={active}
                onClick={() => select(active ? "" : n)}
                className={cn(
                  "grid h-[34px] place-items-center rounded border transition-colors duration-(--duration-base) [&_svg]:size-[17px]",
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-ink"
                    : "border-line text-muted hover:border-brand-300 hover:text-ink",
                )}
              >
                <Icon />
              </button>
            );
          })}
        </div>
        {shown.length === 0 && <p className="py-2 text-center text-12-5 text-faint">No icon matches “{query}”.</p>}
      </div>

      <p className="mt-1.5 text-12-5 text-faint">
        {selected ? `Using “${selected}”. Click again to clear.` : "None selected."}
      </p>

      {error && <p className="mt-1.5 text-12-5 text-err">{error}</p>}
    </div>
  );
}
