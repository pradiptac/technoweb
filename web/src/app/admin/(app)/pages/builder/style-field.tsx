"use client";

import { cn } from "@/lib/utils";
import { Field, Input } from "@/components/ui/input";
import type { SectionStyle } from "@/types/page-sections";

/**
 * A section's style (2026-10-05, `SectionStyle`): how it sits on the page,
 * beside what it says. Every control is a row of buttons showing its
 * choices rather than a select hiding them — spacing, width, alignment and
 * heading size are decisions somebody makes by looking, so the options are
 * on the screen. The first of each is the section's own behaviour and is
 * never stored (`SectionRules::style()` drops it); "Default" says so.
 * Since 0.114.0 two of them are motion — how the heading arrives and what
 * scrolling past does — and both say they are still under reduced motion.
 *
 * `aria-pressed` buttons in a labelled group, each 32px tall — the console's
 * dense scale, still clear of the 24px tap-target floor.
 */
type Key = "pad_top" | "pad_bottom" | "width" | "align" | "heading" | "headline" | "scroll";

/** Said under both motion controls (0.114.0): reduced motion turns each of them off. */
const STILL = "Still for visitors who ask for less motion.";

const CHOICES: Record<Key, { label: string; options: [string, string][]; hint?: string }> = {
  pad_top: { label: "Space above", options: [["default", "Default"], ["none", "None"], ["s", "S"], ["l", "L"], ["xl", "XL"]] },
  pad_bottom: { label: "Space below", options: [["default", "Default"], ["none", "None"], ["s", "S"], ["l", "L"], ["xl", "XL"]] },
  width: { label: "Content width", options: [["default", "Full"], ["medium", "Medium"], ["narrow", "Narrow"]], hint: "Narrow suits a block of text; the screen's edge is never passed." },
  align: { label: "Heading and text", options: [["default", "Left"], ["center", "Centred"]] },
  heading: { label: "Heading size", options: [["default", "Default"], ["s", "Smaller"], ["l", "Larger"]] },
  headline: {
    label: "Heading arrives",
    options: [["default", "Default"], ["rise", "Words rise"], ["wipe", "Wipe in"], ["shimmer", "Shimmer"]],
    hint: `How the heading arrives as the section scrolls into view. ${STILL}`,
  },
  scroll: {
    label: "While scrolling",
    options: [["default", "None"], ["parallax", "Parallax pictures"], ["zoom", "Zoom in"], ["fade", "Fade through"]],
    hint: `An effect tied to scrolling: pictures drifting, the section zooming in, or fading in and out as it passes. ${STILL}`,
  },
};

const DEVICES: [NonNullable<SectionStyle["show_on"]>[number], string][] = [["phone", "Phones"], ["tablet", "Tablets"], ["desktop", "Computers"]];

export function StyleField({ value, onChange, idPrefix, errors }: {
  value: SectionStyle | null | undefined;
  onChange: (next: SectionStyle | null) => void;
  idPrefix: string;
  /** Laravel's messages for `blocks.N.style.*`, keyed by the part after `style.`. */
  errors: Record<string, string | undefined>;
}) {
  const style: SectionStyle = value ?? {};
  const set = (patch: Partial<Record<keyof SectionStyle, unknown>>) => {
    const next: Record<string, unknown> = { ...style, ...patch };
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "default" || v === "" || (Array.isArray(v) && v.length === 3)) delete next[k];
    }
    onChange(Object.keys(next).length ? (next as SectionStyle) : null);
  };
  const shown = style.show_on ?? ["phone", "tablet", "desktop"];

  return (
    <fieldset className="mt-2 rounded-lg border border-line bg-surface p-4">
      <legend className="px-1 text-13-5 font-semibold">Style</legend>

      <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        {/* The spacing as a picture: the band, with the space above and below it drawn to scale. */}
        <div aria-hidden className="hidden w-28 lg:block">
          <div className="rounded-md border border-line-strong bg-card p-2">
            <div className="rounded-sm bg-brand-500/15" style={{ height: { default: 10, none: 2, s: 6, l: 16, xl: 22 }[style.pad_top ?? "default"] }} />
            <div className="my-1 rounded-sm border border-dashed border-brand-ink/40 bg-card px-1.5 py-2">
              <div className={cn("h-1.5 rounded-full bg-ink/50", style.align === "center" ? "mx-auto w-3/4" : "w-3/4", style.heading === "l" && "h-2", style.heading === "s" && "h-1")} />
              <div className={cn("mt-1 h-1 rounded-full bg-muted/50", style.width === "narrow" ? "w-1/2" : style.width === "medium" ? "w-2/3" : "w-full", style.align === "center" && "mx-auto")} />
            </div>
            <div className="rounded-sm bg-brand-500/15" style={{ height: { default: 10, none: 2, s: 6, l: 16, xl: 22 }[style.pad_bottom ?? "default"] }} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(CHOICES) as Key[]).map((key) => {
            const c = CHOICES[key];
            const current = (style[key] as string | undefined) ?? "default";
            return (
              <div key={key} role="group" aria-labelledby={`${idPrefix}-st-${key}`} className="min-w-0">
                <p id={`${idPrefix}-st-${key}`} className="mb-1 text-12-5 font-semibold text-ink-2">{c.label}</p>
                <div className="flex flex-wrap gap-1">
                  {c.options.map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={current === v}
                      onClick={() => set({ [key]: v })}
                      className={cn(
                        "min-h-8 rounded-md border px-2.5 text-12-5 font-semibold transition-colors duration-(--duration-fast)",
                        current === v ? "border-brand-500 bg-brand-50 text-brand-ink" : "border-line-strong bg-card text-muted hover:text-ink",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {c.hint && <p className="mt-1 text-12 text-faint">{c.hint}</p>}
                {errors[key] && <p className="mt-1 text-12-5 text-err">{errors[key]}</p>}
              </div>
            );
          })}

          <div role="group" aria-labelledby={`${idPrefix}-st-show`} className="min-w-0">
            <p id={`${idPrefix}-st-show`} className="mb-1 text-12-5 font-semibold text-ink-2">Show on</p>
            <div className="flex flex-wrap gap-1">
              {DEVICES.map(([d, label]) => {
                const on = shown.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    // The last device cannot be switched off: "shown nowhere" is the Hide button's job.
                    disabled={on && shown.length === 1}
                    onClick={() => set({ show_on: on ? shown.filter((x) => x !== d) : [...shown, d] })}
                    className={cn(
                      "min-h-8 rounded-md border px-2.5 text-12-5 font-semibold transition-colors duration-(--duration-fast) disabled:cursor-not-allowed",
                      on ? "border-brand-500 bg-brand-50 text-brand-ink" : "border-line-strong bg-card text-muted line-through hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {errors.show_on && <p className="mt-1 text-12-5 text-err">{errors.show_on}</p>}
          </div>
        </div>
      </div>

      <Field
        label="Link name"
        htmlFor={`${idPrefix}-st-anchor`}
        className="mt-4 mb-0"
        error={errors.anchor}
        hint={style.anchor ? `Link to it as #${style.anchor} — a menu item or a button can jump straight here.` : "Optional. Lower-case letters, digits and dashes, e.g. pricing."}
      >
        <Input
          id={`${idPrefix}-st-anchor`}
          value={style.anchor ?? ""}
          onChange={(e) => set({ anchor: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+/, "") })}
          maxLength={48}
          spellCheck={false}
          className="font-mono"
        />
      </Field>
    </fieldset>
  );
}
