"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Backdrop } from "@/components/ui/backdrop";
import {
  BUTTONS, HEROS, LOADERS, PAGES, REVEALS, SPLASH_NOTE,
  type HeroVariant, type MotionChoice,
} from "@/lib/motion-choices";
import type { SettingRow } from "@/lib/admin";

/**
 * The Motion tab: six choices, each a row of tiles.
 *
 * Every tile is a label around an `sr-only` radio — the theme cards'
 * markup, so the audit's tap-target and focus rules are already met — and
 * posts under its own setting name, so the generic form action needs to
 * know nothing about this screen. `rows` are the stored values; the
 * `useEffect` re-asserts the checked radio after a save for the reason the
 * theme picker gives (React keeps `checked` in step with state, the browser
 * keeps the DOM, and after a Server Action's reset the two disagree).
 *
 * The previews are the real thing where they can be. A button tile carries
 * `data-motion-buttons` and renders a real `<Button>`, so what moves under
 * the pointer is the rule the site will use rather than a drawing of it.
 * Reveals and page transitions cannot be replayed on demand from the live
 * rules — those fire once, on arrival — so their tiles carry `data-demo` and
 * a matching set of hover-triggered keyframes in globals.css, written to the
 * same numbers. The hero tiles render `<Backdrop>` itself.
 */
export function MotionPicker({ rows }: { rows: SettingRow[] }) {
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));

  const [reveal, setReveal] = useState(stored.motion_reveal || REVEALS[0].id);
  const [buttons, setButtons] = useState(stored.motion_buttons || BUTTONS[0].id);
  const [page, setPage] = useState(stored.motion_page || PAGES[0].id);
  const [loader, setLoader] = useState(stored.motion_loader || LOADERS[0].id);
  const [splash, setSplash] = useState(stored.motion_splash === "1" ? "1" : "0");
  const [hero, setHero] = useState(stored.motion_hero || HEROS[0].id);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chosen: Record<string, string> = {
      setting__motion_reveal: reveal, setting__motion_buttons: buttons, setting__motion_page: page,
      setting__motion_loader: loader, setting__motion_splash: splash, setting__motion_hero: hero,
    };
    for (const input of el.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      const should = input.value === chosen[input.name];
      if (input.checked !== should) input.checked = should;
    }
  });

  return (
    <div ref={ref} className="space-y-8">
      <Choices
        name="setting__motion_reveal" legend="Sections arriving" value={reveal} onChange={setReveal} choices={REVEALS}
        intro="How a section comes into view as the page is scrolled. Hover a tile to see it."
        preview={(c) => (
          <span className="flex h-14 flex-col justify-end gap-1" data-demo={`reveal-${c.id}`} aria-hidden>
            <span className="block h-2 w-3/4 rounded-sm bg-brand-600/80" />
            <span className="block h-2 w-1/2 rounded-sm bg-muted/50" />
            <span className="block h-2 w-2/3 rounded-sm bg-muted/50" />
          </span>
        )}
      />

      <Choices
        name="setting__motion_buttons" legend="Buttons" value={buttons} onChange={setButtons} choices={BUTTONS}
        intro="What a button does under the pointer. These are the live rules, not a drawing: hover and press them."
        preview={(c) => (
          <span className="flex h-14 items-center justify-center" data-motion-buttons={c.id}>
            <Button type="button" size="sm" tabIndex={-1}>Enquire</Button>
          </span>
        )}
      />

      <Choices
        name="setting__motion_page" legend="Page transitions" value={page} onChange={setPage} choices={PAGES}
        intro="How the next page arrives after a link is pressed. Hover a tile to replay it."
        preview={(c) => (
          <span className="flex h-14 items-center justify-center" data-demo={`page-${c.id}`} aria-hidden>
            <span className="block h-10 w-16 rounded border border-line-strong bg-card shadow-1" />
          </span>
        )}
      />

      <Choices
        name="setting__motion_loader" legend="While the next page loads" value={loader} onChange={setLoader} choices={LOADERS}
        intro="A thin line at the very top of the page while a navigation is in flight. Shown only when a page takes longer than a moment."
        preview={(c) => (
          <span className="flex h-14 flex-col justify-center" aria-hidden>
            <span className="block h-0.5 w-full overflow-hidden rounded bg-surface-2">
              <span className="block h-full rounded bg-brand-600" data-demo={`loader-${c.id}`} />
            </span>
          </span>
        )}
      />

      <Choices
        name="setting__motion_splash" legend="First-visit splash" value={splash} onChange={setSplash}
        choices={[
          { id: "0", label: "Off", note: "The page paints at once. The current behaviour." },
          { id: "1", label: "On", note: SPLASH_NOTE },
        ]}
        intro="Whether the first page of a visit opens on the logo."
        preview={(c) => (
          <span className="flex h-14 items-center justify-center" aria-hidden>
            <span className={cn("block h-10 w-16 rounded border border-line-strong", c.id === "1" ? "bg-page" : "bg-card")}>
              {c.id === "1" && <span className="mx-auto mt-3.5 block h-3 w-8 rounded-sm bg-brand-600/80" />}
            </span>
          </span>
        )}
      />

      <Choices
        name="setting__motion_hero" legend="Behind a heading" value={hero} onChange={setHero} choices={HEROS}
        intro="The backdrop behind the homepage hero, a page heading with no banner picture, and the closing band."
        preview={(c) => (
          <div className="relative h-14 overflow-hidden rounded border border-line bg-surface" aria-hidden>
            <Backdrop variant={c.id as HeroVariant} size={14} mask="radial-gradient(ellipse 90% 90% at 50% 0%, #000 20%, transparent 90%)" />
          </div>
        )}
      />
    </div>
  );
}

function Choices({
  name, legend, intro, value, onChange, choices, preview,
}: {
  name: string;
  legend: string;
  intro: string;
  value: string;
  onChange: (id: string) => void;
  choices: MotionChoice[];
  preview: (c: MotionChoice) => ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-[13.5px] font-semibold">{legend}</legend>
      <p className="measure mb-3 text-[13px] text-muted">{intro}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {choices.map((c) => (
          <label
            key={c.id}
            className={cn(
              "motion-tile block cursor-pointer rounded-lg border p-3 transition-colors",
              value === c.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
            )}
          >
            <input type="radio" name={name} value={c.id} checked={value === c.id} onChange={() => onChange(c.id)} className="sr-only" />
            {preview(c)}
            <span className="mt-2 block text-[13px] font-semibold text-ink">{c.label}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-muted">{c.note}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
