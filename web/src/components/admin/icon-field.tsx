"use client";

import { useState } from "react";
import { iconMap, type IconName } from "@/components/icons";
import { IconClose, IconGrid } from "@/components/icons-ui";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const NAMES = Object.keys(iconMap) as IconName[];

/**
 * Icon picker for solutions, services, industries, the homepage statistics —
 * and the menu builder.
 *
 * The icon is stored as a name, and only names in iconMap render on the site —
 * anything else silently draws nothing. So the choice is made from the real
 * icons rather than typed: an editor picks what they can see, and cannot save
 * a name the frontend has never heard of. (The menu builder had a free-text
 * box for months; `globe` typed there drew nothing, for that reason.)
 *
 * ## A field and a dialog, not a grid on the page (the client, 2026-09-24)
 *
 * The ~130 tiles used to sit inline under every picker — eight rows of glyphs
 * per statistic on the Homepage settings, four statistics deep, and the same
 * slab in every entity form. The field is now one row — the chosen glyph, its
 * name and a button — and the grid opens in a `Modal`, with the name under
 * each tile so "shield" is findable by reading as well as by filtering.
 * Picking a tile chooses it and closes the dialog; the × on the field clears.
 *
 * Two ways in. Uncontrolled — `defaultValue` and a hidden `<input name>` — for
 * the entity forms, which post through a Server Action. Controlled — `value`
 * and `onChange` — for a screen that saves through a function, like the
 * menu builder, which keeps a row's icon in its own state.
 */
export function IconField({
  defaultValue, error, value, onChange, name = "icon", id, label = "Icon",
}: {
  defaultValue?: string | null;
  error?: string;
  /** Controlled mode: the current name, or "" for none. */
  value?: string;
  onChange?: (name: string) => void;
  /** The hidden input's name, uncontrolled mode only. */
  name?: string;
  /** Distinguishes several pickers on one screen. */
  id?: string;
  label?: string;
}) {
  const [own, setOwn] = useState<string>(
    defaultValue && NAMES.includes(defaultValue as IconName) ? defaultValue : "",
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const controlled = value !== undefined;
  const selected = controlled ? value : own;
  const select = (next: string) => {
    if (!controlled) setOwn(next);
    onChange?.(next);
  };
  const q = query.trim().toLowerCase();
  const shown = q ? NAMES.filter((n) => n.includes(q)) : NAMES;
  const Current = selected && selected in iconMap ? iconMap[selected as IconName] : null;
  const labelId = id ? `${id}-icon-label` : undefined;

  return (
    <div className="mb-[18px]">
      <span id={labelId} className="mb-[7px] block text-13-5 font-semibold">{label}</span>

      {!controlled && <input type="hidden" name={name} value={selected} />}

      <div className="flex items-stretch gap-2">
        {/* The whole box opens the dialog, not only the button beside it:
            it reads as a field, and a field is pressed where it is. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-labelledby={labelId}
          aria-describedby={labelId ? `${labelId}-value` : undefined}
          className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded border border-line-strong bg-card px-3 text-left transition-colors duration-(--duration-base) hover:border-brand-300"
        >
          <span
            aria-hidden
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded border [&_svg]:size-[17px]",
              Current ? "border-brand-ink/30 text-brand-ink" : "border-dashed border-line-strong text-faint",
            )}
          >
            {Current && <Current />}
          </span>
          <span id={labelId ? `${labelId}-value` : undefined} className={cn("truncate text-13-5", !Current && "text-faint")}>
            {Current ? selected : "No icon — choose one"}
          </span>
        </button>

        {Current && (
          <button
            type="button"
            onClick={() => select("")}
            aria-label={`Clear the ${label.toLowerCase()}`}
            title="Clear"
            className="grid w-11 shrink-0 place-items-center rounded border border-line-strong bg-card text-muted transition-colors duration-(--duration-base) hover:border-err/40 hover:text-err [&_svg]:size-4"
          >
            <IconClose aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Choose ${label.toLowerCase()}`}
          title="Browse icons"
          className="grid w-11 shrink-0 place-items-center rounded border border-line-strong bg-card text-muted transition-colors duration-(--duration-base) hover:border-brand-300 hover:text-ink [&_svg]:size-[18px]"
        >
          <IconGrid aria-hidden />
        </button>
      </div>

      {error && <p className="mt-1.5 text-12-5 text-err">{error}</p>}

      <Modal
        open={open}
        onClose={() => { setOpen(false); setQuery(""); }}
        title="Choose an icon"
        size="lg"
      >
        {/* Sticky so the filter stays in reach while the grid scrolls under it. */}
        <div className="sticky top-0 z-1 -mx-1 bg-card px-1 pb-3">
          <input
            type="search"
            // A dialog opened to search is opened to type.
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons, e.g. shield, cloud, lock…"
            aria-label="Search icons"
            className="field h-11 w-full rounded border border-line-strong bg-card px-3 text-13-5"
          />
        </div>

        {shown.length === 0 ? (
          <p className="py-8 text-center text-13 text-faint">No icon matches “{query}”.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
            {shown.map((n) => {
              const Icon = iconMap[n];
              const active = selected === n;
              return (
                <li key={n}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => { select(n); setOpen(false); setQuery(""); }}
                    className={cn(
                      "flex h-[84px] w-full flex-col items-center justify-center gap-2 rounded-lg border px-1.5 transition-colors duration-(--duration-base) [&_svg]:size-[22px]",
                      active
                        ? "border-brand-600 bg-brand-50 text-brand-ink"
                        : "border-line text-ink hover:border-brand-300 hover:bg-surface",
                    )}
                  >
                    <Icon aria-hidden />
                    <span className={cn("w-full truncate text-center text-12", active ? "text-brand-ink" : "text-muted")}>{n}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </div>
  );
}
