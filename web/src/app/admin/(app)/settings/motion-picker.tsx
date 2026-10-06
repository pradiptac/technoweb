"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Backdrop } from "@/components/ui/backdrop";
import {
  BUTTONS, CARDS, HEROS, LOADERS, PAGES, PROGRESS, REVEALS, SPLASH_NOTE,
  type HeroVariant, type MotionChoice,
} from "@/lib/motion-choices";
import { MOTION_PRESETS, type MotionPreset } from "@/lib/motion-presets";
import type { SettingRow } from "@/lib/admin";

/**
 * The Motion tab: eight choices, each a row of tiles, under a row of
 * presets (`lib/motion-presets.ts`) that set seven of them at once.
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
 * same numbers — except the two page swaps, drawn by `PageSwap` below. The
 * hero tiles render `<Backdrop>` itself.
 */
export function MotionPicker({ rows }: { rows: SettingRow[] }) {
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));

  const [reveal, setReveal] = useState(stored.motion_reveal || REVEALS[0].id);
  const [buttons, setButtons] = useState(stored.motion_buttons || BUTTONS[0].id);
  const [page, setPage] = useState(stored.motion_page || PAGES[0].id);
  const [loader, setLoader] = useState(stored.motion_loader || LOADERS[0].id);
  const [splash, setSplash] = useState(stored.motion_splash === "1" ? "1" : "0");
  const [hero, setHero] = useState(stored.motion_hero || HEROS[0].id);
  const [cards, setCards] = useState(stored.motion_cards || CARDS[0].id);
  const [progress, setProgress] = useState(stored.motion_progress || PROGRESS[0].id);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chosen: Record<string, string> = {
      setting__motion_reveal: reveal, setting__motion_buttons: buttons, setting__motion_page: page,
      setting__motion_loader: loader, setting__motion_splash: splash, setting__motion_hero: hero,
      setting__motion_cards: cards, setting__motion_progress: progress,
    };
    for (const input of el.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      const should = input.value === chosen[input.name];
      if (input.checked !== should) input.checked = should;
    }
  });

  /*
   * A preset writes the tiles, never the settings: the state changes, the
   * effect above re-asserts the radios, and nothing is saved until Save is
   * pressed — the "Start from a look" rule. A programmatic state change fires
   * no input event, so one is announced on the wrapper; it bubbles to the
   * form, where `FormActions` hears it and the leave-guard knows the screen
   * holds unsaved changes.
   */
  const current: Record<string, string> = {
    motion_reveal: reveal, motion_buttons: buttons, motion_page: page, motion_loader: loader,
    motion_hero: hero, motion_cards: cards, motion_progress: progress,
  };
  const setters: Record<string, (v: string) => void> = {
    motion_reveal: setReveal, motion_buttons: setButtons, motion_page: setPage, motion_loader: setLoader,
    motion_hero: setHero, motion_cards: setCards, motion_progress: setProgress,
  };
  const applies = (preset: MotionPreset) => Object.entries(preset.values).every(([k, v]) => current[k] === v);
  const apply = (preset: MotionPreset) => {
    for (const [key, value] of Object.entries(preset.values)) setters[key]?.(value);
    ref.current?.dispatchEvent(new Event("change", { bubbles: true }));
  };

  return (
    // Both columns of the settings grid: a picker is one control, and in one
    // column its tiles stopped at half the screen (the ThemePicker rule).
    <div ref={ref} className="space-y-8 sm:col-span-2">
      <div>
        <p className="mb-2 text-11-5 font-semibold uppercase tracking-[.1em] text-muted">Start from a preset</p>
        <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-5">
          {MOTION_PRESETS.map((preset) => {
            const on = applies(preset);
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={on}
                onClick={() => apply(preset)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors duration-(--duration-fast)",
                  on ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
                )}
              >
                <span className="text-13-5 font-semibold text-ink">{preset.label}</span>
                <span className="text-12 leading-snug text-muted">{preset.note}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-12 text-faint">A preset sets the choices below; nothing changes on the site until you save. Change any one afterwards.</p>
      </div>

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
        name="setting__motion_cards" legend="Cards" value={cards} onChange={setCards} choices={CARDS}
        intro="What a card does under the pointer, on a computer. Phones and reduced-motion visitors always see it still. Hover a tile to try it."
        preview={(c) => (
          <span className="flex h-14 items-center justify-center" data-motion-cards={c.id} aria-hidden>
            <span data-card data-demo={`cards-${c.id}`} className="block h-10 w-20 rounded border border-line-strong bg-card shadow-1 transition-[translate,box-shadow,transform] duration-(--duration-base) ease-brand" />
          </span>
        )}
      />

      <Choices
        name="setting__motion_page" legend="Page transitions" value={page} onChange={setPage} choices={PAGES}
        intro="How the next page arrives after a link is pressed. Hover a tile to replay it."
        preview={(c) => (c.id === "crossfade" || c.id === "slide" ? <PageSwap kind={c.id} /> : (
          <span className="flex h-14 items-center justify-center" data-demo={`page-${c.id}`} aria-hidden>
            <span className="block h-10 w-16 rounded border border-line-strong bg-card shadow-1" />
          </span>
        ))}
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
        name="setting__motion_progress" legend="Reading progress" value={progress} onChange={setProgress} choices={PROGRESS}
        intro="A thin line along the top of every public page that fills as the visitor scrolls down it. Still for visitors who ask for less motion."
        preview={(c) => (
          <span className="flex h-14 flex-col rounded border border-line-strong bg-card" aria-hidden>
            <span className="block h-0.5 w-full overflow-hidden rounded-t bg-surface-2">
              {c.id !== "none" && <span className="block h-full w-2/5 bg-brand-600" />}
            </span>
            <span className="mt-2 ml-2 block h-1.5 w-1/2 rounded-sm bg-muted/50" />
            <span className="mt-1 ml-2 block h-1.5 w-2/3 rounded-sm bg-muted/50" />
          </span>
        )}
      />

      <Choices
        name="setting__motion_splash" legend="First-visit splash" value={splash} onChange={setSplash}
        choices={[
          { id: "0", label: "Off", note: "The page paints at once. The current behaviour." },
          { id: "1", label: "On", note: SPLASH_NOTE },
        ]}
        intro="Whether the first page of a visit opens on a short loader in the theme's own style."
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

/**
 * The preview for the two page transitions that swap one page for the next
 * (0.115.0): `crossfade` and `slide`. A swap needs an old page and a new one,
 * which the single-card replays in globals.css do not have, so these two are
 * drawn here instead (no view transition involved), as two pages stacked in one
 * card, swapped by a transition on the tile's hover (`group` on the label) —
 * so hovering shows the next page and leaving puts the first one back. The
 * card clips, so the slide's off-stage page never widens anything, and
 * `motion-reduce` holds both still.
 */
function PageSwap({ kind }: { kind: "crossfade" | "slide" }) {
  const page = "absolute inset-0 flex flex-col gap-1 p-1.5 transition-[opacity,translate] duration-(--duration-slow) ease-brand motion-reduce:transition-none";
  return (
    <span className="flex h-14 items-center justify-center" aria-hidden>
      <span className="relative block h-10 w-16 overflow-hidden rounded border border-line-strong bg-card shadow-1">
        <span className={cn(page, kind === "crossfade" ? "opacity-100 group-hover:opacity-0" : "group-hover:-translate-x-full")}>
          <span className="block h-1.5 w-3/4 rounded-sm bg-muted/50" />
          <span className="block h-1.5 w-1/2 rounded-sm bg-muted/50" />
          <span className="block h-1.5 w-2/3 rounded-sm bg-muted/50" />
        </span>
        <span className={cn(page, "bg-card", kind === "crossfade" ? "opacity-0 group-hover:opacity-100" : "translate-x-full group-hover:translate-x-0")}>
          <span className="block h-1.5 w-2/3 rounded-sm bg-brand-600/80" />
          <span className="block h-1.5 w-3/4 rounded-sm bg-muted/50" />
          <span className="block h-1.5 w-1/2 rounded-sm bg-muted/50" />
        </span>
      </span>
    </span>
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
    // The id is the setting's, so the command palette's `#setting__<key>` lands here.
    <fieldset id={name}>
      <legend className="mb-1 text-13-5 font-semibold">{legend}</legend>
      <p className="measure mb-3 text-13 text-muted">{intro}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {choices.map((c) => (
          <label
            key={c.id}
            className={cn(
              "motion-tile group block cursor-pointer rounded-lg border p-3 transition-colors",
              value === c.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
            )}
          >
            <input type="radio" name={name} value={c.id} checked={value === c.id} onChange={() => onChange(c.id)} className="sr-only" />
            {preview(c)}
            <span className="mt-2 block text-13 font-semibold text-ink">{c.label}</span>
            <span className="mt-0.5 block text-12 leading-snug text-muted">{c.note}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
