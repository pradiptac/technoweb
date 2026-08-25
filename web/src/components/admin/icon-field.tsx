"use client";

import { useState } from "react";
import { iconMap, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

const NAMES = Object.keys(iconMap) as IconName[];

/**
 * Icon picker for solutions, services and industries.
 *
 * The icon is stored as a name, and only names in iconMap render on the site —
 * anything else silently draws nothing. So this is a fixed grid of the real
 * icons rather than a free-text field: an editor picks what they can see, and
 * cannot save a name the frontend has never heard of.
 */
export function IconField({
  defaultValue, error,
}: {
  defaultValue: string | null;
  error?: string;
}) {
  const [selected, setSelected] = useState<string>(
    defaultValue && NAMES.includes(defaultValue as IconName) ? defaultValue : "",
  );

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-[13.5px] font-semibold">Icon</span>

      <input type="hidden" name="icon" value={selected} />

      <div className="rounded border border-line-strong bg-card p-2.5">
        {/*
          Small fixed tiles that fill the width, rather than six aspect-square
          columns. At six columns each tile was about 60px, so the set was five
          tall rows of mostly empty space — and it gets worse with every icon
          added. auto-fill keeps them 34px whatever the column width, which is
          still comfortably over the 24px tap-target floor the audit enforces.
        */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(34px,1fr))] gap-1">
          {NAMES.map((n) => {
            const Icon = iconMap[n];
            const active = selected === n;
            return (
              <button
                key={n}
                type="button"
                title={n}
                aria-label={n}
                aria-pressed={active}
                onClick={() => setSelected(active ? "" : n)}
                className={cn(
                  "grid h-[34px] place-items-center rounded border transition-colors duration-200 [&_svg]:size-[17px]",
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
      </div>

      <p className="mt-1.5 text-[12.5px] text-faint">
        {selected ? `Using “${selected}”. Click again to clear.` : "None selected."}
      </p>

      {error && <p className="mt-1.5 text-[12.5px] text-err">{error}</p>}
    </div>
  );
}
