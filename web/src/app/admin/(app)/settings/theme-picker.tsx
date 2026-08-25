"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { THEMES, type Theme } from "@/lib/themes";

/**
 * The ten visual directions, as something you choose by looking rather than by
 * reading a name.
 *
 * Each card paints itself in its own tokens — the swatches are the real
 * values, and the specimen line is set in the real display face, because all
 * ten families are declared in the document and a card can simply ask for one.
 * A list of names with hex codes beside them would make this a data-entry task
 * instead of a design decision.
 *
 * Radios rather than a select: ten options that differ visually are exactly
 * the case a select is worst at, and radios give the whole set to a keyboard
 * with arrow keys.
 */
export function ThemePicker({ name, value }: { name: string; value: string | null }) {
  const [chosen, setChosen] = useState(value ?? THEMES[0].id);
  const current = THEMES.find((t) => t.id === chosen) ?? THEMES[0];

  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1 text-[13.5px] font-semibold">Theme</legend>
      <p className="mb-4 max-w-[80ch] text-[13px] text-muted">
        Colour and type for the whole site, the customer portal and this console. Every
        one of these has been checked against WCAG AA on all eighteen text-and-background
        pairings the site renders — none of them can produce unreadable copy.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {THEMES.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            name={name}
            checked={theme.id === chosen}
            onChoose={() => setChosen(theme.id)}
          />
        ))}
      </div>

      <p className="mt-4 text-[13px] text-muted">
        Currently selected: <strong className="text-ink">{current.name}</strong>. Saving reloads
        the site with it — nothing else needs republishing.
      </p>
    </fieldset>
  );
}

function ThemeCard({
  theme, name, checked, onChoose,
}: {
  theme: Theme;
  name: string;
  checked: boolean;
  onChoose: () => void;
}) {
  const c = theme.colors;

  return (
    <label
      className={cn(
        "block cursor-pointer rounded-lg border p-3.5 transition-colors",
        checked ? "border-brand-500 bg-brand-50" : "border-line-strong bg-white hover:border-faint",
      )}
    >
      <span className="flex items-center gap-2.5">
        <input
          type="radio"
          name={name}
          value={theme.id}
          checked={checked}
          onChange={onChoose}
          className="size-4 shrink-0 accent-brand-600"
        />
        <span className="text-[14px] font-semibold text-ink">{theme.name}</span>
      </span>

      {/* The specimen is set in the theme's own display face and its own ink,
          so the card shows the decision rather than describing it. */}
      <span
        className="mt-2.5 block text-[21px] leading-none font-semibold tracking-[-.02em]"
        style={{ fontFamily: `var(${theme.fonts.display.variable})`, color: c.ink }}
      >
        Infrastructure that holds
      </span>

      <span className="mt-2 flex gap-1" aria-hidden>
        {[c.brand900, c.brand700, c.brand600, c.brand500, c.brand300, c.brand100, c.ink, c.muted, c.lineStrong]
          .map((hex, i) => (
            <span
              key={i}
              className="block h-5 flex-1 rounded-[3px] border border-black/5"
              style={{ background: hex }}
            />
          ))}
      </span>

      <span className="mt-2 block text-[12px] text-muted">{theme.note}</span>

      <span className="mt-1.5 block font-mono text-[11.5px] text-faint">
        {theme.fonts.display.label}
        {theme.fonts.body.label !== theme.fonts.display.label ? ` · ${theme.fonts.body.label}` : ""}
      </span>
    </label>
  );
}
