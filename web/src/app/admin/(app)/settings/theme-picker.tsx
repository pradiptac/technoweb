"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { THEMES, paletteFor, type Theme } from "@/lib/themes";
import { useResolvedScheme } from "@/lib/scheme";

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
  // Each card previews the theme as it would render *now*. Painting every card
  // in its light palette left ten specimens of near-black text on a dark card
  // at 1.1:1 — a picker that fails the contrast rules it exists to uphold.
  const scheme = useResolvedScheme("console");
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
            scheme={scheme}
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
  theme, name, checked, onChoose, scheme,
}: {
  theme: Theme;
  name: string;
  checked: boolean;
  onChoose: () => void;
  scheme: "light" | "dark";
}) {
  const c = paletteFor(theme, scheme);

  return (
    <label
      className={cn(
        "block cursor-pointer rounded-lg border p-3.5 transition-colors",
        checked ? "border-brand-500 bg-brand-50" : "border-line-strong bg-card hover:border-faint",
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

      {/*
        The specimen supplies its own background as well as its own ink.

        It used to take the ink from the theme and the background from the page,
        which is a pair that can disagree: before hydration this component
        renders with the server's "light" snapshot, so in dark it painted a
        near-black specimen on a near-black card at 1.04:1. Both values now come
        from the same palette, so the tile is internally consistent whatever the
        page around it is doing — and it reads as a preview *of the theme*,
        which is what it is.
      */}
      <span
        className="mt-2.5 block rounded border border-black/5 px-2.5 py-2"
        style={{ background: c.card, color: c.ink }}
      >
        <span
          className="block text-[19px] leading-none font-semibold tracking-[-.02em]"
          style={{ fontFamily: `var(${theme.fonts.display.variable})` }}
        >
          Infrastructure that holds
        </span>
        <span className="mt-1 block text-[12px]" style={{ color: c.muted }}>
          {theme.fonts.display.label} · {theme.fonts.body.label}
        </span>
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
