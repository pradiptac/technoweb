"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Field, Input } from "@/components/ui/input";
import type { SectionDevice, SectionDeviceStyle, SectionStyle } from "@/types/page-sections";

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
type Key = "pad_top" | "pad_bottom" | "mt" | "mb" | "border" | "shadow" | "width" | "align" | "heading" | "heading_color" | "min_h" | "headline" | "scroll" | "edge_top" | "edge_bottom";

/** The four shapes an edge can take (0.126.0). */
const EDGES: [string, string][] = [["default", "Straight"], ["wave", "Wave"], ["slant", "Slant"], ["curve", "Curve"], ["peak", "Peak"]];

/** Said under both motion controls (0.114.0): reduced motion turns each of them off. */
const STILL = "Still for visitors who ask for less motion.";

/** Space outside the section (0.153.0): the padding's own scale, with a normal step. */
const MARGINS: [string, string][] = [["default", "Default"], ["none", "None"], ["s", "S"], ["m", "Normal"], ["l", "L"], ["xl", "XL"]];

const CHOICES: Record<Key, { label: string; options: [string, string][]; hint?: string }> = {
  pad_top: { label: "Padding above", options: [["default", "Default"], ["none", "None"], ["s", "S"], ["l", "L"], ["xl", "XL"]], hint: "Room inside the section, on its background." },
  pad_bottom: { label: "Padding below", options: [["default", "Default"], ["none", "None"], ["s", "S"], ["l", "L"], ["xl", "XL"]] },
  mt: { label: "Space above", options: MARGINS, hint: "Room outside the section, between it and the one above. Never the sides." },
  mb: { label: "Space below", options: MARGINS, hint: "Room outside the section, between it and the one below." },
  border: {
    label: "Border",
    options: [["default", "None"], ["line", "Light"], ["strong", "Strong"], ["brand", "Brand"]],
    hint: "A rule along the top and foot of the section, in a colour from the theme.",
  },
  shadow: {
    label: "Shadow",
    options: [["default", "None"], ["s", "Soft"], ["m", "Medium"], ["l", "Large"]],
    hint: "Lifts the section off the page. Not drawn on a section with a shaped edge.",
  },
  width: { label: "Content width", options: [["default", "Full"], ["medium", "Medium"], ["narrow", "Narrow"]], hint: "Narrow suits a block of text; the screen's edge is never passed." },
  align: { label: "Heading and text", options: [["default", "Left"], ["center", "Centred"]] },
  heading: { label: "Heading size", options: [["default", "Default"], ["s", "Smaller"], ["l", "Larger"]] },
  heading_color: {
    label: "Heading colour",
    options: [["default", "Default"], ["brand", "Brand"], ["secondary", "Secondary"], ["accent", "Accent"]],
    hint: "A readable shade of the theme colour, matched to this section’s background.",
  },
  min_h: {
    label: "Minimum height",
    options: [["default", "Default"], ["s", "S"], ["m", "M"], ["l", "L"], ["screen", "Full screen"]],
    hint: "At least this tall, with the content centred. Full screen is the visible window less the site header.",
  },
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
  edge_top: {
    label: "Top edge",
    options: EDGES,
    hint: "The shape of the section's top where it meets the one above. Needs a background on this section; not drawn on the first section of a page.",
  },
  edge_bottom: {
    label: "Bottom edge",
    options: EDGES,
    hint: "The shape of the section's foot where it meets the one below. Needs a background on this section.",
  },
};

const DEVICES: [NonNullable<SectionStyle["show_on"]>[number], string][] = [["phone", "Phones"], ["tablet", "Tablets"], ["desktop", "Computers"]];

/**
 * What a device may say differently (0.146.0, `SectionRules::RESPONSIVE`). No
 * "Default" step: a row with nothing pressed inherits the base, and "Same as
 * other screens" says so. `m` is the section’s normal rhythm and is stored.
 */
type DeviceKey = keyof SectionDeviceStyle;
const PADS: [string, string][] = [["none", "None"], ["s", "S"], ["m", "Normal"], ["l", "L"], ["xl", "XL"]];
const DEVICE_ROWS: { key: DeviceKey; label: string; options: [string, string][] }[] = [
  { key: "pad_top", label: "Padding above", options: PADS },
  { key: "pad_bottom", label: "Padding below", options: PADS },
  { key: "mt", label: "Space above", options: PADS },
  { key: "mb", label: "Space below", options: PADS },
  { key: "align", label: "Heading and text", options: [["start", "Left"], ["center", "Centred"], ["end", "Right"]] },
  { key: "min_h", label: "Minimum height", options: [["none", "None"], ["s", "S"], ["m", "M"], ["l", "L"], ["screen", "Full screen"]] },
];
const DEVICE_LABEL: Record<SectionDevice, string> = { phone: "Phone", tablet: "Tablet", desktop: "Computer" };

export function StyleField({ value, onChange, idPrefix, errors, sectionType, headingColorExcept = [] }: {
  value: SectionStyle | null | undefined;
  onChange: (next: SectionStyle | null) => void;
  idPrefix: string;
  /** Laravel's messages for `blocks.N.style.*`, keyed by the part after `style.` (a per-device one keeps its dotted path). */
  errors: Record<string, string | undefined>;
  /** The section's type, to know whether its heading colour is honoured. */
  sectionType?: string;
  /** The API's `style_options.heading_color_except`: types on a band of fixed colour. */
  headingColorExcept?: string[];
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

  // Per-device overrides (0.146.0). Written apart from `set()`, which strips
  // "default" and would eat `m`; this removes an emptied device and an emptied
  // `responsive`, so the section stores nothing it does not need.
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<SectionDevice>("phone");
  const responsive = style.responsive ?? {};
  const overridden = (Object.keys(responsive) as SectionDevice[]).filter((d) => Object.keys(responsive[d] ?? {}).length > 0);
  const deviceErrors = Object.keys(errors).filter((k) => k.startsWith("responsive."));
  const isOpen = open || deviceErrors.length > 0;
  const setDeviceValue = (d: SectionDevice, key: DeviceKey, v: string | undefined) => {
    const nextDevice: Record<string, unknown> = { ...(responsive[d] ?? {}) };
    if (v === undefined) delete nextDevice[key];
    else nextDevice[key] = v;
    const nextResponsive: Record<string, unknown> = { ...responsive };
    if (Object.keys(nextDevice).length) nextResponsive[d] = nextDevice;
    else delete nextResponsive[d];
    set({ responsive: Object.keys(nextResponsive).length ? nextResponsive : undefined });
  };
  // A shaped edge is cut into the room the section's padding leaves it, so a device may not take that room away.
  const edgeFor = (key: DeviceKey) => (key === "pad_top" ? style.edge_top : key === "pad_bottom" ? style.edge_bottom : undefined);
  const noHeadingColor = sectionType !== undefined && headingColorExcept.includes(sectionType);

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
                      disabled={key === "heading_color" && noHeadingColor}
                      onClick={() => set({ [key]: v })}
                      className={cn(
                        "min-h-8 rounded-md border px-2.5 text-12-5 font-semibold transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-50",
                        current === v ? "border-brand-500 bg-brand-50 text-brand-ink" : "border-line-strong bg-card text-muted hover:text-ink",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {key === "heading_color" && noHeadingColor
                  ? <p className="mt-1 text-12 text-faint">This kind of section keeps its own heading colour.</p>
                  : c.hint && <p className="mt-1 text-12 text-faint">{c.hint}</p>}
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

      <div className="mt-4 rounded-md border border-line">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={`${idPrefix}-st-devices`}
          onClick={() => setOpen(!isOpen)}
          className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-12-5 font-semibold text-ink-2 hover:text-ink"
        >
          <span aria-hidden className={cn("inline-block transition-[rotate] duration-(--duration-fast)", isOpen && "rotate-90")}>▸</span>
          <span>Different on phone / tablet / computer</span>
          {overridden.length > 0 && (
            <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-12 text-brand-ink">{overridden.length === 1 ? "1 screen" : `${overridden.length} screens`}</span>
          )}
        </button>

        <div id={`${idPrefix}-st-devices`} hidden={!isOpen} className="border-t border-line p-3">
          <p className="mb-2 text-12 text-faint">Padding, space, alignment and height can change by screen. Anything left on “Same as other screens” follows the settings above.</p>
          <div role="group" aria-label="Screen to edit" className="mb-3 flex flex-wrap gap-1">
            {(Object.keys(DEVICE_LABEL) as SectionDevice[]).map((d) => {
              const count = Object.keys(responsive[d] ?? {}).length;
              const bad = deviceErrors.some((k) => k.startsWith(`responsive.${d}.`));
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  onClick={() => setDevice(d)}
                  className={cn(
                    "min-h-8 rounded-md border px-2.5 text-12-5 font-semibold transition-colors duration-(--duration-fast)",
                    device === d ? "border-brand-500 bg-brand-50 text-brand-ink" : "border-line-strong bg-card text-muted hover:text-ink",
                    bad && "border-err text-err",
                  )}
                >
                  {DEVICE_LABEL[d]}{count > 0 ? ` · ${count}` : ""}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {DEVICE_ROWS.map((row) => {
              const current = responsive[device]?.[row.key] as string | undefined;
              const edge = edgeFor(row.key);
              const err = errors[`responsive.${device}.${row.key}`];
              return (
                <div key={row.key} role="group" aria-labelledby={`${idPrefix}-st-${device}-${row.key}`} className="min-w-0">
                  <p id={`${idPrefix}-st-${device}-${row.key}`} className="mb-1 text-12-5 font-semibold text-ink-2">{row.label}</p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      aria-pressed={current === undefined}
                      onClick={() => setDeviceValue(device, row.key, undefined)}
                      className={cn(
                        "min-h-8 rounded-md border px-2.5 text-12-5 font-semibold transition-colors duration-(--duration-fast)",
                        current === undefined ? "border-brand-500 bg-brand-50 text-brand-ink" : "border-line-strong bg-card text-muted hover:text-ink",
                      )}
                    >
                      Same as other screens
                    </button>
                    {row.options.map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={current === v}
                        disabled={!!edge && (v === "none" || v === "s")}
                        onClick={() => setDeviceValue(device, row.key, v)}
                        className={cn(
                          "min-h-8 rounded-md border px-2.5 text-12-5 font-semibold transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-50",
                          current === v ? "border-brand-500 bg-brand-50 text-brand-ink" : "border-line-strong bg-card text-muted hover:text-ink",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {edge && <p className="mt-1 text-12 text-faint">A shaped edge needs room, so None and S are not offered here.</p>}
                  {err && <p className="mt-1 text-12-5 text-err">{err}</p>}
                </div>
              );
            })}
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
